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
import { panel, text, COMPONENTS_V2_FLAG } from "@/lib/discordComponentsV2";
import { FREE_SERVER_RENEWAL_DAYS } from "@/lib/serverRenewal";
import { panelUsernameForUser } from "@/lib/pterodactylUser";
import { syncAppProxyMap } from "@/lib/appProxy";
import { rewardPresetInstalled } from "@/lib/promotions";
import type { HostNode, Server } from "@/generated/prisma/client";

export class ProvisioningError extends Error {}

/** 무료 서버는 자동 생성되는 주소 1개뿐 — 더 필요하면 포인트로 EXTRA_SUBDOMAIN을 사야 한다 */
export const MAX_SUBDOMAINS_PER_SERVER = 1;
/** 유료 플랜은 포인트 없이도 기본으로 주소를 여러 개 쓸 수 있다 (유료 플랜 특장점) */
export const MAX_SUBDOMAINS_PER_SERVER_PAID = 3;

/// egg 자체 접속 비밀번호류 환경변수 키 — 모든 서버가 같은 기본값을 쓰면 안 되므로 서버 생성 시
/// 항상 무작위로 새로 채워 넣는다. 커뮤니티 프리셋(UserPreset)도 이 키들은 절대 덮어쓸 수 없다.
export const SECRET_ENV_KEYS = ["PASSWORD", "PGPASSWORD", "SERVER_PASSWORD", "MONGO_USER_PASS", "MEILI_MASTER_KEY"];

/** 마인크래프트 버전 선택 드롭다운이 채워주는 키들 — egg마다 이름이 달라서 여러 개를 둔다.
 * FABRIC_VERSION/LOADER_VERSION/빌드 번호류는 "로더/빌드 버전"이라는 별개 개념이라 포함하지 않음 */
export const MINECRAFT_VERSION_ENV_ALIASES = ["MINECRAFT_VERSION", "MC_VERSION", "VANILLA_VERSION"];

/** Pterodactyl 관례상 CPU 퍼센트 100 = 코어 1개 */
export const CPU_PERCENT_PER_CORE = 100;

/**
 * 요청한 RAM/디스크/CPU를 배치할 수 있는 노드 후보를 여유 RAM이 많은 순으로 정렬해 반환한다.
 * 온라인 + 자동배치 켜진 노드만 대상으로 한다.
 *
 * forUserId가 있으면("전용서버"류 상품) 그 유저에게 전용 배정된 노드(HostNode.dedicatedToUserId)만
 * 대상으로 한다 — 아직 배정 전이면 후보가 0개라 선주문으로 빠진다. forUserId가 없으면(일반 상품)
 * 전용 배정된 노드는 전부 제외해서, 전용 고객의 자리를 다른 고객이 차지하지 못하게 한다.
 */
async function findCapacityCandidates(
  ramMb: number,
  diskMb: number,
  cpuPercent: number,
  forUserId?: string,
) {
  const allNodes = await prisma.hostNode.findMany({
    where: { status: "ONLINE", autoDeployEnabled: true },
  });
  const nodes = forUserId
    ? allNodes.filter((n) => n.dedicatedToUserId === forUserId)
    : allNodes.filter((n) => n.dedicatedToUserId === null);

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
async function selectNode(ramMb: number, diskMb: number, cpuPercent: number, forUserId?: string) {
  const candidates = await findCapacityCandidates(ramMb, diskMb, cpuPercent, forUserId);
  if (candidates.length === 0) {
    throw new ProvisioningError(
      forUserId
        ? "아직 전용 노드가 배정되지 않았어요. 관리자가 확인 후 상담 채널로 안내드려요."
        : "현재 요청한 리소스를 배치할 수 있는 노드가 없습니다. 관리자에게 문의해주세요.",
    );
  }
  return candidates[0].node;
}

/** 지금 이 리소스를 배치할 수 있는 노드가 하나라도 있는지만 확인 (주문 생성 시 선주문 여부 판단용) */
export async function hasNodeCapacity(
  ramMb: number,
  diskMb: number,
  cpuPercent: number,
  forUserId?: string,
): Promise<boolean> {
  const candidates = await findCapacityCandidates(ramMb, diskMb, cpuPercent, forUserId);
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
  /** 포인트 상점(EXTRA_SUBDOMAIN)으로 슬롯을 늘린 서버는 기본값보다 높은 한도를 넘겨준다 */
  maxOverride?: number;
}) {
  const max = params.maxOverride ?? MAX_SUBDOMAINS_PER_SERVER;
  const existingCount = await prisma.serverSubdomain.count({
    where: { serverId: params.server.id },
  });
  if (existingCount >= max) {
    throw new ProvisioningError(`서버당 서브도메인은 최대 ${max}개까지만 만들 수 있어요.`);
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

  // 같은 주문에 대해 거의 동시에 두 번 호출되면(겹친 클릭, 재시도, 크론+API 등) 둘 다 위의
  // serverId 체크를 통과해서 둘 다 서버를 만들 수 있다 — Pterodactyl 서버가 실제로 2개 생겨도
  // order.serverId는 마지막에 쓴 쪽만 가리켜서 나머지는 고아가 된다. provisioningStartedAt을
  // 원자적으로 먼저 찍어서(한쪽만 성공) 이 창을 없앤다.
  const claim = await prisma.order.updateMany({
    where: { id: order.id, provisioningStartedAt: null },
    data: { provisioningStartedAt: new Date() },
  });
  if (claim.count === 0) {
    // 이미 다른 요청이 생성을 시작했다 — 끝날 때까지 짧게 기다렸다가 결과를 반환한다.
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const latest = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      if (latest.serverId) {
        return prisma.server.findUniqueOrThrow({ where: { id: latest.serverId } });
      }
    }
    throw new ProvisioningError("서버 생성이 이미 진행 중이에요. 잠시 후 다시 확인해주세요.");
  }

  // 여기서부터 실패하면(용량 부족, Pterodactyl 오류, DB 트랜잭션 실패 등) 반드시 위에서 찍은
  // provisioningStartedAt 선점을 풀어줘야 한다 — 안 풀면 이 주문은 재시도할 때마다 "이미 진행
  // 중"으로 오인돼서 영원히 서버를 못 만든다. (성공해서 order.serverId가 생기면 그 이후로는
  // 맨 위의 serverId 체크로 바로 빠져나가니 풀어줄 필요가 없다.)
  let pteroServerForCleanup: { id: number } | null = null;
  let server: Server;
  let node: HostNode;
  let preset: { id: string; gitRepoUrl: string | null; createdById: string } | null;
  let template: { category: string; startupCommand: string; dockerImage: string; defaultEnvironment: unknown; pterodactylEggId: number; pterodactylNestId: number; id: string; key: string };
  let pteroServer: PteroApp.PteroServer;
  try {

  if (!order.product) {
    throw new ProvisioningError("이 주문의 상품이 삭제되어 서버를 생성할 수 없습니다. 관리자에게 문의해주세요.");
  }
  const product = order.product;

  template = order.templateIdRequested
    ? await prisma.serverTemplate.findUniqueOrThrow({
        where: { id: order.templateIdRequested },
      })
    : product.allowedTemplates[0];
  if (!template) throw new ProvisioningError("서버 종류를 찾을 수 없습니다.");

  const settings = await prisma.hostingSettings.findUniqueOrThrow({ where: { id: 1 } });

  node = await selectNode(
    product.ramMb,
    product.diskMb,
    product.cpuPercent,
    product.requiresDedicatedNode ? order.userId : undefined,
  );

  const [firstName, ...rest] = order.user.name.split(" ");
  const pteroUser = await PteroApp.findOrCreateUser({
    email: order.user.email,
    username: panelUsernameForUser(order.userId),
    firstName: firstName || order.user.name,
    lastName: rest.join(" ") || "Burnae",
  });
  if (!order.user.pterodactylUserId) {
    await prisma.user.update({ where: { id: order.userId }, data: { pterodactylUserId: pteroUser.id } });
  }

  const allocation = await PteroApp.getFreeAllocation(node.pterodactylNodeId);

  // PASSWORD 같은 egg 자체 접속 비밀번호(Postgres PGPASSWORD, Redis SERVER_PASSWORD, Mongo
  // MONGO_USER_PASS, Meilisearch MEILI_MASTER_KEY 등)는 모든 서버가 defaultEnvironment의 같은
  // 기본값을 그대로 쓰면 남의 서버에 그 기본값으로 접속할 수 있는 심각한 보안 문제가 된다 —
  // 서버마다 무작위로 새로 생성해서 덮어쓰고 accessSecret에 저장해 소유자에게만 보여준다
  const defaultEnv = template.defaultEnvironment as Record<string, string | number | boolean>;
  const secretEnvKey = SECRET_ENV_KEYS.find((key) => key in defaultEnv);
  const accessSecret = secretEnvKey ? crypto.randomBytes(9).toString("base64url") : null;

  // 커뮤니티 프리셋을 골랐다면 그 저장소 주소를 GIT_ADDRESS로 적용한다. 신고 누적으로
  // 비공개(delisted)된 프리셋은 이미 결제 전에 걸러지긴 하지만, 결제와 적용 사이 시차를 노린
  // 악용을 막기 위해 여기서도 다시 한번 delisted 여부와 baseTemplateId 일치 여부를 확인한다.
  preset = order.presetIdRequested
    ? await prisma.userPreset.findFirst({
        where: { id: order.presetIdRequested, baseTemplateId: template.id, delisted: false },
      })
    : null;
  const gitAddressToApply = preset?.gitRepoUrl ?? order.gitRepoRequested;

  const dockerImage = order.dockerImageRequested ?? template.dockerImage;

  const environment: Record<string, string | number | boolean> = {
    ...defaultEnv,
    // 에그마다 버전 변수 이름이 달라서(MINECRAFT_VERSION/MC_VERSION/VANILLA_VERSION) 존재하는
    // 키만 선택해서 덮어쓴다 — FABRIC_VERSION/LOADER_VERSION/빌드 번호류는 별개 개념이라 건드리지 않음
    ...(template.category === "MINECRAFT"
      ? Object.fromEntries(
          MINECRAFT_VERSION_ENV_ALIASES.filter((key) => key in defaultEnv).map((key) => [
            key,
            order.minecraftVersionRequested ?? "latest",
          ]),
        )
      : {}),
    ...("GIT_ADDRESS" in defaultEnv && gitAddressToApply
      ? { GIT_ADDRESS: gitAddressToApply, USER_UPLOAD: "0" }
      : {}),
    // 봇 토큰/API 키처럼 egg가 필수로 요구하지만 기본값으로 채울 수 없는 변수 — 주문 시점에
    // 사용자가 직접 입력한 값(customVariables)이 프리셋 기본값보다 항상 우선해야 한다
    ...((order.customVariables as Record<string, string> | null) ?? {}),
    ...(accessSecret && secretEnvKey ? { [secretEnvKey]: accessSecret } : {}),
    SERVER_MEMORY: product.ramMb,
  };

  // GENERAL 카테고리 템플릿이 공유하는 egg는 변수 스키마가 비어 있어서, 패널이 egg에 등록되지
  // 않은 커스텀 환경변수(PASSWORD, GIT_ADDRESS, 봇 토큰 등)는 조용히 무시한다 — {{KEY}}/${KEY}
  // 치환도, 실제 컨테이너 env 주입도 안 돼서 시작 명령어에 빈 값이 들어가는 문제가 있었다.
  // (SERVER_PORT처럼 Wings가 기본 제공하는 값은 영향 없음 — 우리가 직접 넣은 키만 치환한다.)
  // 값을 이미 우리가 알고 있으니, Pterodactyl에 보내기 전에 시작 명령어 문자열에 직접 박아 넣는다.
  let resolvedStartupCommand = template.startupCommand;
  for (const [key, value] of Object.entries(environment)) {
    const str = String(value);
    resolvedStartupCommand = resolvedStartupCommand.split(`{{${key}}}`).join(str).split(`\${${key}}`).join(str);
  }

  pteroServer = await PteroApp.createServer({
    name: order.serverNameRequested ?? `${order.user.name}의 서버`,
    userId: pteroUser.id,
    nodeId: node.pterodactylNodeId,
    allocationId: allocation.id,
    eggId: template.pterodactylEggId,
    nestId: template.pterodactylNestId,
    dockerImage,
    startupCommand: resolvedStartupCommand,
    environment,
    memoryMb: product.ramMb,
    diskMb: product.diskMb,
    cpuPercent: product.cpuPercent,
    backupSlots: product.backupSlots,
  });
  pteroServerForCleanup = pteroServer;

  try {
  server = await prisma.$transaction(async (tx) => {
    const created = await tx.server.create({
      data: {
        ownerId: order.userId,
        productId: product.id,
        productNameSnapshot: product.name,
        priceMonthlyKrwSnapshot: product.priceMonthlyKrw,
        templateId: template.id,
        nodeId: node.id,
        name: order.serverNameRequested ?? `${order.user.name}의 서버`,
        minecraftVersion:
          template.category === "MINECRAFT" ? order.minecraftVersionRequested ?? "최신" : null,
        dockerImage,
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
        // 0원 상품(무료 서버)은 7일마다 직접 갱신해야 한다(방치된 무료 서버가 자원을 계속
        // 차지하는 걸 막기 위함) — 결제 상품은 기존대로 30일. pointsRedeemable(포인트 교환 가능
        // 여부)과는 별개 — 0원이면 포인트 상품이 아니어도 자동으로 무료 서버로 취급한다
        renewalDueAt: new Date(
          Date.now() +
            (product.priceMonthlyKrw === 0 ? FREE_SERVER_RENEWAL_DAYS : 30) * 24 * 60 * 60 * 1000,
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
  } catch (err) {
    // DB 트랜잭션이 실패하면(유니크 충돌, 연결 끊김 등) Pterodactyl에는 이미 실제 서버가 떠서
    // DB에는 아무 기록도 없는 "고아" 컨테이너가 남는다 — 노드 용량 계산에도 안 잡혀서 과판매로
    // 이어진다. 실패했으면 방금 만든 Pterodactyl 서버를 바로 지워서 재시도가 깨끗하게 시작하게 한다.
    await PteroApp.deleteServer(pteroServer.id).catch((cleanupErr) => {
      console.error(`[provisioning] 고아 Pterodactyl 서버(#${pteroServer.id}) 정리 실패 — 수동 확인 필요:`, cleanupErr);
    });
    await prisma.order.update({ where: { id: order.id }, data: { provisioningStartedAt: null } }).catch(() => {});
    throw err;
  }

  } catch (err) {
    // product/template/node 조회, Pterodactyl 유저/allocation 준비 단계에서 실패한 경우(위의
    // 안쪽 catch가 처리하는 "DB 트랜잭션 실패" 이전 단계) — 선점을 풀어서 재시도가 가능하게 한다.
    // pteroServerForCleanup이 설정돼 있다면 안쪽 catch가 이미 정리했으므로 중복 호출만 막는다.
    if (!pteroServerForCleanup) {
      await prisma.order.update({ where: { id: order.id }, data: { provisioningStartedAt: null } }).catch(() => {});
    }
    throw err;
  }

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

  // name.app.krl.kr(포트 없는 접속 주소)를 바로 쓸 수 있게 즉시 시도 — 실패해도 크론이 10분마다
  // 다시 동기화하니 서버 생성 자체를 막지 않는다
  syncAppProxyMap(prisma).catch((err) => {
    console.error("[provisioning] app.krl.kr 프록시 맵 동기화 실패(크론에서 재시도됨):", err);
  });

  notifyServerCreated(server, order.userId, node.name).catch((err) => {
    console.error("[provisioning] 디스코드 알림/역할 부여 실패(서버 생성 자체는 정상):", err);
  });

  if (preset) {
    prisma.userPreset.update({ where: { id: preset.id }, data: { useCount: { increment: 1 } } }).catch((err) => {
      console.error("[provisioning] 프리셋 사용 횟수 갱신 실패:", err);
    });
    // 프리셋 만든 사람이 자기 프리셋으로 직접 서버를 만든 경우는 포인트 파밍 방지를 위해 지급 제외
    if (preset.createdById !== order.userId) {
      rewardPresetInstalled(preset.createdById).catch((err) => {
        console.error("[provisioning] 프리셋 설치 포인트 지급 실패:", err);
      });
    }
  }

  // 마인크래프트 EULA 자동 동의 — 이걸 안 하면 서버가 뜨자마자 "eula=false"로 바로 종료되고,
  // Wings 크래시 감지가 그 정상 종료를 크래시로 오인해서 무한 재시작 루프에 빠진다.
  // 설치가 끝나기 전엔 파일이 없을 수 있어 몇 번 재시도한다.
  // 마인크래프트 egg가 아니면 eula.txt 자체가 의미 없으니 만들지 않는다.
  if (template.category === "MINECRAFT") {
    acceptEulaWithRetry(pteroServer.identifier).catch((err) => {
      console.error("[provisioning] EULA 자동 동의 실패:", err);
    });
  }

  // 빈 서버(blank-server)의 SSH 비밀번호 — 시작 명령어 문자열에 그대로 박아 넣으면 Wings가
  // 콘솔에 그 명령어 전체를 그대로 echo해서 비밀번호가 콘솔 로그에 남는다. 그래서 시작 명령어는
  // 짧은 부트 스크립트 다운로드+실행 한 줄만 두고(public/downloads/burnae-boot.sh), 실제
  // 비밀번호는 파일로 미리 써둔다 — 부트 스크립트는 이 파일이 이미 있으면 새로 만들지 않고 그대로 쓴다
  if (template.key === "blank-server" && server.accessSecret) {
    writeSshPasswordWithRetry(pteroServer.identifier, server.accessSecret).catch((err) => {
      console.error("[provisioning] SSH 비밀번호 파일 기록 실패:", err);
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
      components: [panel(0x22c55e).addTextDisplayComponents(text(`### 🆕 서버 생성\n**${server.name}** — ${nodeName}`)).toJSON()],
      flags: COMPONENTS_V2_FLAG,
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

async function writeSshPasswordWithRetry(identifier: string, password: string, attempt = 0): Promise<void> {
  try {
    await PteroClient.writeFile(identifier, ".burnae_ssh_pass", password);
    return;
  } catch (err) {
    if (attempt >= 10) throw err;
    await new Promise((resolve) => setTimeout(resolve, 5000 + attempt * 3000));
    return writeSshPasswordWithRetry(identifier, password, attempt + 1);
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
        components: [panel(0xef4444).addTextDisplayComponents(text(`### 🗑️ 서버 삭제\n**${server.name}**`)).toJSON()],
        flags: COMPONENTS_V2_FLAG,
      });
    })
    .catch((err) => console.error("[provisioning] 삭제 로그 알림 실패:", err));

  syncAppProxyMap(prisma).catch((err) => {
    console.error("[provisioning] app.krl.kr 프록시 맵 동기화 실패(크론에서 재시도됨):", err);
  });

  return updated;
}

/// 포인트 상점(EXTRA_PORT)으로 산 추가 포트는 기존 서버 포트/관리자 수동 할당 포트와 안 겹치게
/// 9000번대(9000~9999)에서만 고른다 — 다른 용도 포트와 섞이지 않게 눈에 보이는 범위로 구분
const EXTRA_PORT_RANGE_MIN = 9000;
const EXTRA_PORT_RANGE_MAX = 9999;

/**
 * 노드에서 9000~9999번대 중 비어있는 포트를 하나 찾아 새 allocation을 만들고 그 id/ip/port를 반환한다.
 * 동시 요청으로 충돌할 수 있어 생성 실패(이미 다른 요청이 같은 포트를 선점) 시 몇 번 재시도한다.
 */
export async function allocateExtraPort(node: HostNode): Promise<{ id: number; ip: string; port: number }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const allocations = await PteroApp.listNodeAllocations(node.pterodactylNodeId);
    const used = new Set(
      allocations.filter((a) => a.ip === node.publicIp).map((a) => a.port),
    );
    const candidates: number[] = [];
    for (let p = EXTRA_PORT_RANGE_MIN; p <= EXTRA_PORT_RANGE_MAX; p++) {
      if (!used.has(p)) candidates.push(p);
    }
    if (candidates.length === 0) {
      throw new ProvisioningError("이 노드에는 추가로 할당할 수 있는 포트(9000~9999)가 남아있지 않아요.");
    }
    const port = candidates[Math.floor(Math.random() * candidates.length)];
    try {
      await PteroApp.createNodeAllocation(node.pterodactylNodeId, node.publicIp, port);
    } catch {
      continue; // 동시 요청 충돌 — 다시 목록을 가져와서 재시도
    }
    const refreshed = await PteroApp.listNodeAllocations(node.pterodactylNodeId);
    const created = refreshed.find((a) => a.ip === node.publicIp && a.port === port);
    if (created) return { id: created.id, ip: created.ip, port: created.port };
  }
  throw new ProvisioningError("포트 생성에 실패했습니다. 다시 시도해주세요.");
}
