import { prisma } from "@/lib/prisma";
import { PteroApp, PteroClient } from "@/lib/pterodactyl";
import {
  createServerDnsRecords,
  deleteServerDnsRecords,
  slugifySubdomain,
  isSubdomainTaken,
} from "@/lib/cloudflare";
import type { HostNode, Server } from "@/generated/prisma/client";

export class ProvisioningError extends Error {}

export const MAX_SUBDOMAINS_PER_SERVER = 2;

/** Pterodactyl 관례상 CPU 퍼센트 100 = 코어 1개 */
export const CPU_PERCENT_PER_CORE = 100;

/**
 * 리소스 여유가 가장 많은 노드를 선택한다.
 * 여러 노드가 등록돼 있으면 RAM/디스크/CPU 여유를 모두 감안해 배치 가능한 노드 중
 * RAM 여유가 가장 큰 곳을 고른다 — 노드 하나가 꽉 차면 자동으로 다음 노드로 넘어간다.
 */
async function selectNode(ramMb: number, diskMb: number, cpuPercent: number) {
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

  const candidates = nodes
    .map((node) => {
      const used = usageMap.get(node.id) ?? { ram: 0, disk: 0, cpu: 0 };
      const freeRam = node.totalRamMb - node.reservedRamMb - used.ram;
      const freeDisk = node.totalDiskMb - node.reservedDiskMb - used.disk;
      const freeCpu = node.cpuCores * CPU_PERCENT_PER_CORE - used.cpu;
      return { node, freeRam, freeDisk, freeCpu };
    })
    .filter((c) => c.freeRam >= ramMb && c.freeDisk >= diskMb && c.freeCpu >= cpuPercent)
    .sort((a, b) => b.freeRam - a.freeRam);

  if (candidates.length === 0) {
    throw new ProvisioningError(
      "현재 요청한 리소스를 배치할 수 있는 노드가 없습니다. 관리자에게 문의해주세요.",
    );
  }
  return candidates[0].node;
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

  const template = order.templateIdRequested
    ? await prisma.serverTemplate.findUniqueOrThrow({
        where: { id: order.templateIdRequested },
      })
    : order.product.allowedTemplates[0];
  if (!template) throw new ProvisioningError("서버 종류를 찾을 수 없습니다.");

  const settings = await prisma.hostingSettings.findUniqueOrThrow({ where: { id: 1 } });

  // 유저 저장공간 한도 확인 (인당 기본 10GB, 관리자가 상향 가능)
  const quotaGb = order.user.storageQuotaGbOverride ?? settings.defaultUserStorageGb;
  const currentUsage = await prisma.server.aggregate({
    where: { ownerId: order.userId, deletedAt: null },
    _sum: { diskMb: true },
  });
  const usedMb = currentUsage._sum.diskMb ?? 0;
  if (usedMb + order.product.diskMb > quotaGb * 1024) {
    throw new ProvisioningError(
      `저장공간 한도(${quotaGb}GB)를 초과합니다. 관리자에게 문의하거나 기존 서버를 정리해주세요.`,
    );
  }

  const node = await selectNode(order.product.ramMb, order.product.diskMb, order.product.cpuPercent);

  const [firstName, ...rest] = order.user.name.split(" ");
  const pteroUser = await PteroApp.findOrCreateUser({
    email: order.user.email,
    username: `burnae_${order.userId.slice(-8)}`,
    firstName: firstName || order.user.name,
    lastName: rest.join(" ") || "Burnae",
  });

  const allocation = await PteroApp.getFreeAllocation(node.pterodactylNodeId);

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
      ...(template.defaultEnvironment as Record<string, string | number | boolean>),
      MINECRAFT_VERSION: order.minecraftVersionRequested ?? "latest",
      SERVER_MEMORY: order.product.ramMb,
    },
    memoryMb: order.product.ramMb,
    diskMb: order.product.diskMb,
    cpuPercent: order.product.cpuPercent,
    backupSlots: order.product.backupSlots,
  });

  const server = await prisma.$transaction(async (tx) => {
    const created = await tx.server.create({
      data: {
        ownerId: order.userId,
        productId: order.productId,
        templateId: template.id,
        nodeId: node.id,
        name: order.serverNameRequested ?? `${order.user.name}의 서버`,
        minecraftVersion: order.minecraftVersionRequested ?? "최신",
        status: "PROVISIONING",
        pterodactylServerId: pteroServer.id,
        pterodactylUuid: pteroServer.uuid,
        pterodactylIdentifier: pteroServer.identifier,
        ramMb: order.product.ramMb,
        cpuPercent: order.product.cpuPercent,
        diskMb: order.product.diskMb,
        backupSlots: order.product.backupSlots,
        allocationIp: node.publicIp,
        allocationPort: allocation.port,
        renewalDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    await tx.order.update({ where: { id: order.id }, data: { serverId: created.id } });
    if (order.product.aiCreditsPerMonth > 0) {
      await tx.user.update({
        where: { id: order.userId },
        data: { aiCreditsRemaining: { increment: order.product.aiCreditsPerMonth } },
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

  return server;
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
    await PteroApp.deleteServer(server.pterodactylServerId);
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

  return updated;
}
