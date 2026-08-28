import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { PteroApp, PteroClient } from "@/lib/pterodactyl";
import {
  createServerDnsRecords,
  deleteServerDnsRecords,
  slugifySubdomain,
  isSubdomainTaken,
} from "@/lib/cloudflare";
import { getBotSettings } from "@/lib/botSettings";
import { addDiscordRole, sendDiscordChannelMessage } from "@/lib/discordNotify";
import { FREE_SERVER_RENEWAL_DAYS } from "@/lib/serverRenewal";
import type { HostNode, Server } from "@/generated/prisma/client";

export class ProvisioningError extends Error {}

export const MAX_SUBDOMAINS_PER_SERVER = 2;

/** Pterodactyl 관례상 CPU 퍼센트 100 = 코어 1개 */
export const CPU_PERCENT_PER_CORE = 100;

/**
 * 요청한 RAM/디스크/CPU를 배치할 수 있는 노드 후보를 여유 RAM이 많은 순으로 정렬해 반환한다.
 * 온라인 + 자동배치 켜진 노드만 대상으로 한다.
 */
async function findCapacityCandidates(ramMb: number, diskMb: number, cpuPercent: number) {
  const nodes = await prisma.hostNode.findMany({
    where: { status: "ONLINE", autoDeployEnabled: true },
  });

  const usage = await prisma.server.groupBy({
    by: ["nodeId"],
    where: { deletedAt: null },
    _sum: { ramMb: true, diskMb: true, cpuPercent: true },
  });
  const usageMap = new Map(
    usage.map((u) => [
      u.nodeId,
      { ram: u._sum.ramMb ?? 0, disk: u._sum.diskMb ?? 0, cpu: u._sum.cpuPercent ?? 0 },
    ]),
  );

  return nodes
    .map((node) => {
      const used = usageMap.get(node.id) ?? { ram: 0, disk: 0, cpu: 0 };
      const freeRam = node.totalRamMb - node.reservedRamMb - used.ram;
      const freeDisk = node.totalDiskMb - node.reservedDiskMb - used.disk;
      const freeCpu = node.cpuCores * CPU_PERCENT_PER_CORE - used.cpu;
      return { node, freeRam, freeDisk, freeCpu };
    })
    .filter((c) => c.freeRam >= ramMb && c.freeDisk >= diskMb && c.freeCpu >= cpuPercent)
    .sort((a, b) => b.freeRam - a.freeRam);
}

/**
 * 리소스 여유가 가장 많은 노드를 선택한다.
 * 여러 노드가 등록돼 있으면 RAM/디스크/CPU 여유를 모두 감안해 배치 가능한 노드 중
 * RAM 여유가 가장 큰 곳을 고른다 — 노드 하나가 꽉 차면 자동으로 다음 노드로 넘어간다.
 */
async function selectNode(ramMb: number, diskMb: number, cpuPercent: number) {
  const candidates = await findCapacityCandidates(ramMb, diskMb, cpuPercent);
  if (candidates.length === 0) {
    throw new ProvisioningError(
      "현재 요청한 리소스를 배치할 수 있는 노드가 없습니다. 관리자에게 문의해주세요.",
    );
  }
  return candidates[0].node;
}

/** 지금 이 리소스를 배치할 수 있는 노드가 하나라도 있는지만 확인 (주문 생성 시 선주문 여부 판단용) */
export async function hasNodeCapacity(ramMb: number, diskMb: number, cpuPercent: number): Promise<boolean> {
  const candidates = await findCapacityCandidates(ramMb, diskMb, cpuPercent);
  return candidates.length > 0;
}

/**
 * 특정 노드의 여유 자원을 계산한다. excludeServerId를 주면 그 서버 자신의 사용량은 빼고 계산 —
 * "이 서버를 업그레이드해도 지금 있는 노드에 자리가 남는가"를 확인할 때 쓴다.
 */
export async function getNodeFreeCapacity(nodeId: string, excludeServerId?: string) {
  const node = await prisma.hostNode.findUniqueOrThrow({ where: { id: nodeId } });
  const usage = await prisma.server.aggregate({
    where: {
      nodeId,
      deletedAt: null,
      ...(excludeServerId ? { id: { not: excludeServerId } } : {}),
    },
    _sum: { ramMb: true, diskMb: true, cpuPercent: true },
  });
  return {
    freeRam: node.totalRamMb - node.reservedRamMb - (usage._sum.ramMb ?? 0),
    freeDisk: node.totalDiskMb - node.reservedDiskMb - (usage._sum.diskMb ?? 0),
    freeCpu: node.cpuCores * CPU_PERCENT_PER_CORE - (usage._sum.cpuPercent ?? 0),
  };
}

async function uniqueSubdomain(desired: string, fallbackSeed: string) {
  const base = slugifySubdomain(desired, fallbackSeed);
  let candidate = base;
  for (let i = 0; i < 20; i++) {
    const [inDb, inCloudflare] = await Promise.all([
      prisma.serverSubdomain.findUnique({ where: { subdomain: candidate } }),
      isSubdomainTaken(candidate).catch(() => false),
    ]);
    if (!inDb && !inCloudflare) return candidate;
    candidate = `${base}-${Math.floor(Math.random() * 900 + 100)}`;
  }
  throw new ProvisioningError("서브도메인 생성에 실패했습니다. 다시 시도해주세요.");
}

/** 서버 생성 시 기본 서브도메인 1개, 또는 소유자가 나중에 추가하는 2번째 서브도메인에 공통으로 사용 */
export async function provisionSubdomain(params: {
  server: Server;
  node: HostNode;
  desiredName: string;
  isPrimary: boolean;
}) {
  const existingCount = await prisma.serverSubdomain.count({
    where: { serverId: params.server.id },
  });
  if (existingCount >= MAX_SUBDOMAINS_PER_SERVER) {
    throw new ProvisioningError(
      `서버당 서브도메인은 최대 ${MAX_SUBDOMAINS_PER_SERVER}개까지만 만들 수 있어요.`,
    );
  }
  if (!params.server.allocationPort) {
    throw new ProvisioningError("서버에 할당된 포트가 없습니다.");
  }

  const subdomain = await uniqueSubdomain(params.desiredName, params.server.id);
  const dns = await createServerDnsRecords({
    subdomain,
    nodePublicIp: params.node.publicIp,
    nodeFqdn: params.node.fqdn,
    port: params.server.allocationPort,
  });

  return prisma.serverSubdomain.create({
    data: {
      serverId: params.server.id,
      subdomain,
      dnsARecordId: dns.aRecordId,
      dnsSrvRecordId: dns.srvRecordId,
      isPrimary: params.isPrimary,
    },
  });
}

export async function removeSubdomain(subdomainId: string) {
  const record = await prisma.serverSubdomain.findUniqueOrThrow({ where: { id: subdomainId } });
  await deleteServerDnsRecords({
    aRecordId: record.dnsARecordId ?? undefined,
    srvRecordId: record.dnsSrvRecordId ?? undefined,
  });
  await prisma.serverSubdomain.delete({ where: { id: subdomainId } });
}

/**
 * 결제 완료된 주문으로 실제 서버를 생성한다.
 * 순서: 리소스 확인 → 노드 선택 → Pterodactyl 유저/서버 생성 → Cloudflare 서브도메인 → DB 반영
 */
export async function createServerForOrder(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { user: true, product: { include: { allowedTemplates: true } } },
  });

  if (order.status !== "PAID") {
    throw new ProvisioningError("결제가 완료되지 않은 주문입니다.");
  }
  if (order.serverId) {
    return prisma.server.findUniqueOrThrow({ where: { id: order.serverId } });
  }
  if (!order.product) {
    throw new ProvisioningError("이 주문의 상품이 삭제되어 서버를 생성할 수 없습니다. 관리자에게 문의해주세요.");
  }
  const product = order.product;

  const template = order.templateIdRequested
    ? await prisma.serverTemplate.findUniqueOrThrow({
        where: { id: order.templateIdRequested },
      })
    : product.allowedTemplates[0];
  if (!template) throw new ProvisioningError("서버 종류를 찾을 수 없습니다.");

  const settings = await prisma.hostingSettings.findUniqueOrThrow({ where: { id: 1 } });

  const node = await selectNode(product.ramMb, product.diskMb, product.cpuPercent);

  const [firstName, ...rest] = order.user.name.split(" ");
  const pteroUser = await PteroApp.findOrCreateUser({
    email: order.user.email,
    username: `burnae_${order.userId.slice(-8)}`,
    firstName: firstName || order.user.name,
    lastName: rest.join(" ") || "Burnae",
  });

  const allocation = await PteroApp.getFreeAllocation(node.pterodactylNodeId);

  // PASSWORD 같은 egg 자체 접속 비밀번호는 모든 서버가 defaultEnvironment의 같은 기본값을
  // 그대로 쓰면 남의 서버에 그 기본값으로 접속할 수 있는 심각한 보안 문제가 된다 —
  // 서버마다 무작위로 새로 생성해서 덮어쓰고 accessSecret에 저장해 소유자에게만 보여준다
  const defaultEnv = template.defaultEnvironment as Record<string, string | number | boolean>;
  const accessSecret = "PASSWORD" in defaultEnv ? crypto.randomBytes(9).toString("base64url") : null;

  const pteroServer = await PteroApp.createServer({
    name: order.serverNameRequested ?? `${order.user.name}의 서버`,
    userId: pteroUser.id,
    nodeId: node.pterodactylNodeId,
    allocationId: allocation.id,
    eggId: template.pterodactylEggId,
    nestId: template.pterodactylNestId,
    dockerImage: template.dockerImage,
    startupCommand: template.startupCommand,
    environment: {
      ...defaultEnv,
      ...(template.category === "MINECRAFT"
        ? { MINECRAFT_VERSION: order.minecraftVersionRequested ?? "latest" }
        : {}),
      ...(accessSecret ? { PASSWORD: accessSecret } : {}),
      SERVER_MEMORY: product.ramMb,
    },
    memoryMb: product.ramMb,
    diskMb: product.diskMb,
    cpuPercent: product.cpuPercent,
    backupSlots: product.backupSlots,
  });

  const server = await prisma.$transaction(async (tx) => {
    const created = await tx.server.create({
      data: {
        ownerId: order.userId,
        productId: product.id,
        templateId: template.id,
        nodeId: node.id,
        name: order.serverNameRequested ?? `${order.user.name}의 서버`,
        minecraftVersion:
          template.category === "MINECRAFT" ? order.minecraftVersionRequested ?? "최신" : null,
        status: "PROVISIONING",
        pterodactylServerId: pteroServer.id,
        pterodactylUuid: pteroServer.uuid,
        pterodactylIdentifier: pteroServer.identifier,
        ramMb: product.ramMb,
        cpuPercent: product.cpuPercent,
        diskMb: product.diskMb,
        backupSlots: product.backupSlots,
        allocationIp: node.publicIp,
        allocationPort: allocation.port,
        accessSecret,
        // 포인트 교환 등 무료 상품은 7일마다 직접 갱신해야 한다(방치된 무료 서버가 자원을 계속
        // 차지하는 걸 막기 위함) — 결제 상품은 기존대로 30일
        renewalDueAt: new Date(
          Date.now() +
            (product.pointsRedeemable ? FREE_SERVER_RENEWAL_DAYS : 30) * 24 * 60 * 60 * 1000,
        ),
      },
    });
    await tx.order.update({ where: { id: order.id }, data: { serverId: created.id } });
    if (product.aiCreditsPerMonth > 0) {
      await tx.user.update({
        where: { id: order.userId },
        data: { aiCreditsRemaining: { increment: product.aiCreditsPerMonth } },
      });
    }
    await tx.auditLog.create({
      data: {
        actorUserId: order.userId,
        action: "SERVER_CREATED",
        targetType: "Server",
        targetId: created.id,
        metadata: { orderId: order.id, node: node.name },
      },
    });
    return created;
  });

  try {
    await provisionSubdomain({
      server,
      node,
      desiredName: order.serverNameRequested ?? order.user.name,
      isPrimary: true,
    });
  } catch (err) {
    // DNS 실패는 서버 접속 편의 기능일 뿐 — 서버 자체는 살아있으므로 삭제하지 않고 기록만 남긴다
    console.error("[provisioning] Cloudflare DNS 생성 실패:", err);
  }

  notifyServerCreated(server, order.userId, node.name).catch((err) => {
    console.error("[provisioning] 디스코드 알림/역할 부여 실패(서버 생성 자체는 정상):", err);
  });

  // 마인크래프트 EULA 자동 동의 — 이걸 안 하면 서버가 뜨자마자 "eula=false"로 바로 종료되고,
  // Wings 크래시 감지가 그 정상 종료를 크래시로 오인해서 무한 재시작 루프에 빠진다.
  // 설치가 끝나기 전엔 파일이 없을 수 있어 몇 번 재시도한다.
  acceptEulaWithRetry(pteroServer.identifier).catch((err) => {
    console.error("[provisioning] EULA 자동 동의 실패:", err);
  });

  // 디스코드 봇 호스팅은 컨테이너가 텅 비어있으면 그냥 재포장한 마인크래프트 서버처럼 느껴지니,
  // 바로 실행해볼 수 있는 최소 예제 코드를 미리 심어둔다 — 유저가 파일 관리자에서 지우고
  // 자기 코드로 바꾸면 그만이다
  if (template.category === "DISCORD_BOT") {
    seedDiscordBotStarterFiles(pteroServer.identifier, template.key).catch((err) => {
      console.error("[provisioning] 디스코드 봇 예제 코드 심기 실패:", err);
    });
  }

  return server;
}

/** 구매자 역할 자동 부여 + 관리자 로그 채널 알림 — 디스코드 연동을 안 했거나 채널 설정이 없으면 조용히 건너뛴다 */
async function notifyServerCreated(server: Server, ownerId: string, nodeName: string) {
  const settings = await getBotSettings();
  if (!settings) return;

  if (settings.purchaserRoleId) {
    const link = await prisma.discordLink.findUnique({ where: { userId: ownerId } });
    if (link) await addDiscordRole(link.discordUserId, settings.purchaserRoleId);
  }

  if (settings.logChannelId) {
    await sendDiscordChannelMessage(settings.logChannelId, {
      embeds: [
        {
          title: "🆕 서버 생성",
          description: `**${server.name}** — ${nodeName}`,
          color: 0x22c55e,
        },
      ],
    });
  }
}

/**
 * 서버 설치가 끝나기 전엔 파일시스템이 아직 없어서 write가 실패할 수 있으므로 잠깐씩 텀을 두고 재시도한다.
 * 설치가 너무 오래 걸리는 경우(느린 다운로드 등)에도 결국엔 성공하도록 넉넉히(최대 5분) 시도한다.
 */
async function acceptEulaWithRetry(identifier: string, attempt = 0): Promise<void> {
  try {
    await PteroClient.writeFile(identifier, "eula.txt", "eula=true\n");
    return;
  } catch (err) {
    if (attempt >= 10) throw err;
    await new Promise((resolve) => setTimeout(resolve, 5000 + attempt * 3000));
    return acceptEulaWithRetry(identifier, attempt + 1);
  }
}

const DISCORD_BOT_PRESETS: Record<string, Record<string, string>> = {
  "nodejs-bot": {
    "index.js": `// discord.js 핑퐁 봇 예제 — 이 파일을 지우고 자기 코드를 올려도 됩니다.
// 1) 파일 관리자에서 .env 없이 바로 토큰을 넣으려면 아래 TOKEN을 채우거나
//    "서버 설정 > 시작 변수"에 DISCORD_TOKEN을 추가해서 process.env.DISCORD_TOKEN을 쓰세요.
const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once("ready", () => console.log(\`로그인됨: \${client.user.tag}\`));

client.on("messageCreate", (message) => {
  if (message.author.bot) return;
  if (message.content === "!핑") message.reply("퐁!");
});

const TOKEN = process.env.DISCORD_TOKEN || "여기에_봇_토큰을_넣으세요";
client.login(TOKEN);
`,
    "package.json": JSON.stringify(
      { name: "burnae-discord-bot", version: "1.0.0", main: "index.js", dependencies: { "discord.js": "^14.14.1" } },
      null,
      2,
    ),
  },
  "python-bot": {
    "bot.py": `# discord.py 핑퐁 봇 예제 — 이 파일을 지우고 자기 코드를 올려도 됩니다.
import os
import discord

intents = discord.Intents.default()
intents.message_content = True
client = discord.Client(intents=intents)

@client.event
async def on_ready():
    print(f"로그인됨: {client.user}")

@client.event
async def on_message(message):
    if message.author == client.user:
        return
    if message.content == "!핑":
        await message.channel.send("퐁!")

TOKEN = os.environ.get("DISCORD_TOKEN", "여기에_봇_토큰을_넣으세요")
client.run(TOKEN)
`,
    "requirements.txt": "discord.py>=2.3.0\n",
  },
};

/** EULA와 같은 이유로 설치가 끝나기 전엔 파일 쓰기가 실패할 수 있어 재시도한다 */
async function seedDiscordBotStarterFiles(identifier: string, templateKey: string, attempt = 0): Promise<void> {
  const files = DISCORD_BOT_PRESETS[templateKey];
  if (!files) return;
  try {
    for (const [name, content] of Object.entries(files)) {
      await PteroClient.writeFile(identifier, name, content);
    }
  } catch (err) {
    if (attempt >= 10) throw err;
    await new Promise((resolve) => setTimeout(resolve, 5000 + attempt * 3000));
    return seedDiscordBotStarterFiles(identifier, templateKey, attempt + 1);
  }
}

/**
 * 서버를 완전히 삭제한다.
 * 순서: 중지 → (선택)백업 생성 → Pterodactyl 서버 삭제(Docker 컨테이너/포트 자동 회수) → DNS 전부 정리 → DB 정리
 */
export async function deleteServerFully(
  serverId: string,
  options: { createFinalBackup: boolean; requestedByUserId: string },
) {
  const server = await prisma.server.findUniqueOrThrow({
    where: { id: serverId },
    include: { subdomains: true },
  });
  if (server.deletedAt) return server;

  await prisma.server.update({ where: { id: serverId }, data: { status: "DELETING" } });

  if (server.pterodactylIdentifier) {
    try {
      await PteroClient.sendPowerAction(server.pterodactylIdentifier, "stop");
    } catch (err) {
      console.error("[provisioning] 서버 정지 실패(계속 진행):", err);
    }

    if (options.createFinalBackup) {
      try {
        await PteroClient.createBackup(
          server.pterodactylIdentifier,
          `삭제 전 자동 백업 ${new Date().toISOString().slice(0, 10)}`,
        );
      } catch (err) {
        console.error("[provisioning] 삭제 전 백업 실패(계속 진행):", err);
      }
    }
  }

  if (server.pterodactylServerId) {
    try {
      await PteroApp.deleteServer(server.pterodactylServerId);
    } catch (err) {
      // Wings가 일시적으로 죽어있거나 응답이 없어도 삭제 자체가 여기서 영영 멈추면 안 된다 —
      // DB 쪽 삭제는 그대로 마무리하고, 판넬에 남은 자원은 로그로 남겨 나중에 수동 정리한다.
      console.error("[provisioning] Pterodactyl 서버 삭제 실패(DB 정리는 계속 진행):", err);
    }
  }

  await Promise.allSettled(
    server.subdomains.map((s) =>
      deleteServerDnsRecords({
        aRecordId: s.dnsARecordId ?? undefined,
        srvRecordId: s.dnsSrvRecordId ?? undefined,
      }),
    ),
  );

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.server.update({
      where: { id: serverId },
      data: { deletedAt: new Date(), status: "DELETING" },
    });
    await tx.serverSubdomain.deleteMany({ where: { serverId } });
    await tx.auditLog.create({
      data: {
        actorUserId: options.requestedByUserId,
        action: "SERVER_DELETED",
        targetType: "Server",
        targetId: serverId,
        metadata: { finalBackup: options.createFinalBackup },
      },
    });
    return result;
  });

  getBotSettings()
    .then((settings) => {
      if (!settings?.logChannelId) return;
      return sendDiscordChannelMessage(settings.logChannelId, {
        embeds: [{ title: "🗑️ 서버 삭제", description: `**${server.name}**`, color: 0xef4444 }],
      });
    })
    .catch((err) => console.error("[provisioning] 삭제 로그 알림 실패:", err));

  return updated;
}
