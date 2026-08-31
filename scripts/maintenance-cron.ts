import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PteroApp, PteroClient } from "../src/lib/pterodactyl";
import { sendDiscordDM } from "../src/lib/discordNotify";
import { deleteServerFully } from "../src/lib/provisioning";
import { getRecentDeposits, isValidDepositorName } from "../src/lib/hanabank";
import { markOrderPaidAndFulfill, retryPreorderFulfillment } from "../src/lib/orderFulfillment";
import { ProvisioningError } from "../src/lib/provisioning";

/**
 * 주기적으로(예: 5~10분마다) 실행하는 운영 크론.
 * systemd timer(deploy/burnae-maintenance.timer)로 등록해서 돌린다. 1회 실행하고 종료.
 *
 * 하는 일:
 *   1. 결제 만료 임박(D-3/D-1) 알림 → 연체 시 정지 → 정지 후 보관기간 지나면 삭제
 *   2. 예약 자동 백업 / 예약 자동 재시작
 *   3. 노드 RAM/CPU 판매율 과부하 시 관리자에게 알림
 *   4. 하나은행 거래내역 폴링으로 입금 자동 매칭 (실시간 웹훅이 없어서 주기적으로 조회해야 함)
 *   5. 선주문(결제는 됐지만 노드 자리가 없었던 주문) 재배치 시도
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const RETENTION_DAYS = 7; // 정지 후 이 기간이 지나면 완전 삭제
const REMINDER_COOLDOWN_HOURS = 20; // 같은 알림을 하루에 한 번만 보내기 위한 최소 간격
const NODE_ALERT_THRESHOLD = 0.9; // RAM 판매율 90% 넘으면 경고
const NODE_ALERT_COOLDOWN_HOURS = 20;

async function recentlyLogged(action: string, targetId: string, withinHours: number) {
  const since = new Date(Date.now() - withinHours * 60 * 60 * 1000);
  const found = await prisma.auditLog.findFirst({
    where: { action, targetId, createdAt: { gte: since } },
  });
  return !!found;
}

async function notifyOwner(userId: string, message: string) {
  const link = await prisma.discordLink.findUnique({ where: { userId } });
  if (!link) return false;
  return sendDiscordDM(link.discordUserId, message);
}

function mapWingsState(state: string): "RUNNING" | "STARTING" | "STOPPING" | "STOPPED" | null {
  switch (state) {
    case "running": return "RUNNING";
    case "starting": return "STARTING";
    case "stopping": return "STOPPING";
    case "offline": return "STOPPED";
    default: return null;
  }
}

/**
 * Server.status는 생성 시 "PROVISIONING"으로 한 번 찍히고, 전원 조작(시작/재시작/정지) API는
 * Wings에만 신호를 보낼 뿐 DB를 갱신하지 않는다 — 그래서 그냥 두면 서버가 실제로는 몇 시간째
 * 잘 돌고 있어도 대시보드 목록엔 영원히 "생성 중"으로 보이고, 자동 백업(status:"RUNNING" 조건)도
 * 절대 실행되지 않는다. 여기서 주기적으로 Wings의 실제 상태를 읽어와 DB에 동기화한다.
 * SUSPENDED/DELETING/MIGRATING 상태는 다른 흐름이 명시적으로 관리하는 상태라 건드리지 않는다.
 */
async function handleServerStatusSync() {
  const servers = await prisma.server.findMany({
    where: {
      deletedAt: null,
      pterodactylIdentifier: { not: null },
      status: { notIn: ["SUSPENDED", "DELETING", "MIGRATING"] },
    },
  });

  for (const server of servers) {
    try {
      const resources = await PteroClient.getServerResources(server.pterodactylIdentifier!);
      const mapped = mapWingsState(resources.current_state);
      if (mapped && mapped !== server.status) {
        await prisma.server.update({ where: { id: server.id }, data: { status: mapped } });
        console.log(`[cron] ${server.name} — 상태 동기화 ${server.status} → ${mapped}`);
      }
    } catch (err) {
      // Wings가 일시적으로 응답 없을 수 있음 — 조용히 스킵하고 다음 크론에서 재시도
    }
  }
}

async function handleRenewals() {
  const now = Date.now();
  const in3days = new Date(now + 3 * 24 * 60 * 60 * 1000);

  const dueSoon = await prisma.server.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ["SUSPENDED", "DELETING"] },
      renewalDueAt: { lte: in3days, gt: new Date(now) },
    },
  });

  for (const server of dueSoon) {
    const isFree = server.priceMonthlyKrwSnapshot === 0;
    const daysLeft = Math.ceil((server.renewalDueAt!.getTime() - now) / (24 * 60 * 60 * 1000));
    const reminderDays = isFree ? [2, 1] : [3, 1];
    if (!reminderDays.includes(daysLeft)) continue;

    const action = `RENEWAL_REMINDER_D${daysLeft}`;
    if (await recentlyLogged(action, server.id, REMINDER_COOLDOWN_HOURS)) continue;

    const message = isFree
      ? `⏰ **${server.name}** 무료 서버 갱신 기한이 ${daysLeft}일 남았어요. \`/갱신\` 명령어나 대시보드에서 갱신해주세요.`
      : `⏰ **${server.name}** 서버 결제 만료가 ${daysLeft}일 남았어요. burnae.kr 대시보드에서 미리 갱신해주세요.`;
    const sent = await notifyOwner(server.ownerId, message);
    await prisma.auditLog.create({
      data: { action, targetType: "Server", targetId: server.id, metadata: { daysLeft, discordNotified: sent } },
    });
    console.log(`[cron] ${server.name} — D-${daysLeft} 알림 ${sent ? "발송" : "스킵(디스코드 미연동)"}`);
  }

  const overdue = await prisma.server.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ["SUSPENDED", "DELETING", "PROVISIONING"] },
      renewalDueAt: { lt: new Date(now) },
    },
  });

  for (const server of overdue) {
    if (!server.pterodactylServerId) continue;
    try {
      await PteroApp.suspendServer(server.pterodactylServerId);
    } catch (err) {
      console.error(`[cron] ${server.name} 정지 실패:`, err);
      continue;
    }
    const reason = server.priceMonthlyKrwSnapshot === 0 ? "무료 서버 갱신 기한 만료" : "결제 만료";
    await prisma.server.update({
      where: { id: server.id },
      data: { status: "SUSPENDED", suspendedReason: reason },
    });
    await notifyOwner(
      server.ownerId,
      `⛔ **${server.name}** 서버가 ${reason}로 일시정지됐어요. ${RETENTION_DAYS}일 안에 갱신하지 않으면 삭제돼요.`,
    );
    await prisma.auditLog.create({
      data: { action: "SERVER_SUSPENDED_OVERDUE", targetType: "Server", targetId: server.id, metadata: {} },
    });
    console.log(`[cron] ${server.name} — 결제 만료로 정지`);
  }

  const retentionCutoff = new Date(now - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const toDelete = await prisma.server.findMany({
    where: { deletedAt: null, status: "SUSPENDED", renewalDueAt: { lt: retentionCutoff } },
  });

  for (const server of toDelete) {
    try {
      await deleteServerFully(server.id, { createFinalBackup: true, requestedByUserId: server.ownerId });
      await notifyOwner(
        server.ownerId,
        `🗑️ **${server.name}** 서버가 결제 미납 보관기간(${RETENTION_DAYS}일)이 지나 삭제됐어요. 마지막 백업은 삭제 직전에 생성했어요.`,
      );
      console.log(`[cron] ${server.name} — 보관기간 만료로 삭제`);
    } catch (err) {
      console.error(`[cron] ${server.name} 삭제 실패:`, err);
    }
  }
}

const RESOURCE_KIND_LABEL: Record<string, string> = {
  RAM_UPGRADE: "RAM",
  CPU_UPGRADE: "CPU",
  DISK_UPGRADE: "저장공간",
};

/**
 * 포인트 상점 RAM/CPU/저장공간 증설(ResourceUpgradeGrant)은 30일 시한부다. 만료 임박(D-3/D-1)이면
 * 알리고, 만료됐으면 서버별로 묶어서 한 번에 자원을 원래대로 되돌린다. 그 사이 유료 플랜으로
 * 전환된 서버는 되돌리지 않고 그냥 소멸시킨다(유료 자원을 실수로 깎으면 안 되므로).
 */
async function handleResourceUpgradeExpiry() {
  const now = Date.now();
  const in3days = new Date(now + 3 * 24 * 60 * 60 * 1000);

  const dueSoon = await prisma.resourceUpgradeGrant.findMany({
    where: { expiresAt: { lte: in3days, gt: new Date(now) } },
    include: { server: true },
  });
  for (const grant of dueSoon) {
    if (!grant.server || grant.server.deletedAt) continue;
    const daysLeft = Math.ceil((grant.expiresAt.getTime() - now) / (24 * 60 * 60 * 1000));
    if (![3, 1].includes(daysLeft)) continue;

    const action = `UPGRADE_GRANT_REMINDER_D${daysLeft}`;
    if (await recentlyLogged(action, grant.id, REMINDER_COOLDOWN_HOURS)) continue;

    const label = RESOURCE_KIND_LABEL[grant.kind] ?? grant.kind;
    const sent = await notifyOwner(
      grant.userId,
      `⏰ **${grant.server.name}** 서버의 ${label} 증설이 ${daysLeft}일 뒤 만료돼요. 갱신하지 않으면 자동으로 줄어들어요 — 대시보드에서 갱신할 수 있어요.`,
    );
    await prisma.auditLog.create({
      data: { action, targetType: "ResourceUpgradeGrant", targetId: grant.id, metadata: { daysLeft, discordNotified: sent } },
    });
  }

  const expired = await prisma.resourceUpgradeGrant.findMany({
    where: { expiresAt: { lt: new Date(now) } },
    include: { server: { include: { product: true } } },
  });
  const byServer = new Map<string, typeof expired>();
  for (const g of expired) {
    if (!byServer.has(g.serverId)) byServer.set(g.serverId, []);
    byServer.get(g.serverId)!.push(g);
  }

  for (const [, grants] of byServer) {
    const server = grants[0].server;
    const grantIds = grants.map((g) => g.id);

    if (!server || server.deletedAt) {
      await prisma.resourceUpgradeGrant.deleteMany({ where: { id: { in: grantIds } } });
      continue;
    }

    const priceMonthlyKrw = server.priceMonthlyKrwSnapshot ?? server.product?.priceMonthlyKrw ?? 0;
    if (priceMonthlyKrw !== 0) {
      // 그 사이 유료 플랜으로 전환됨 — 되돌리지 않고 그냥 소멸 처리
      await prisma.resourceUpgradeGrant.deleteMany({ where: { id: { in: grantIds } } });
      console.log(`[cron] ${server.name} — 유료 전환됨, 만료된 증설 ${grantIds.length}건 소멸 처리(되돌리지 않음)`);
      continue;
    }
    if (!server.pterodactylServerId) continue; // 아직 프로비저닝 전 — 다음 크론에서 재시도

    let deltaRam = 0, deltaCpu = 0, deltaDisk = 0;
    for (const g of grants) {
      if (g.kind === "RAM_UPGRADE") deltaRam += g.amount;
      if (g.kind === "CPU_UPGRADE") deltaCpu += g.amount;
      if (g.kind === "DISK_UPGRADE") deltaDisk += g.amount;
    }
    const ramFloor = server.product?.ramMb ?? 128;
    const cpuFloor = server.product?.cpuPercent ?? 10;
    const diskFloor = server.product?.diskMb ?? 512;
    const nextRamMb = Math.max(ramFloor, server.ramMb - deltaRam);
    const nextCpuPercent = Math.max(cpuFloor, server.cpuPercent - deltaCpu);
    const nextDiskMb = Math.max(diskFloor, server.diskMb - deltaDisk);

    try {
      await PteroApp.updateServerBuild(server.pterodactylServerId, {
        memoryMb: nextRamMb,
        diskMb: nextDiskMb,
        cpuPercent: nextCpuPercent,
        backupSlots: server.backupSlots,
      });
      await prisma.server.update({
        where: { id: server.id },
        data: { ramMb: nextRamMb, cpuPercent: nextCpuPercent, diskMb: nextDiskMb },
      });
      if (server.pterodactylIdentifier) await PteroClient.sendPowerAction(server.pterodactylIdentifier, "restart");
      await prisma.resourceUpgradeGrant.deleteMany({ where: { id: { in: grantIds } } });
      await notifyOwner(
        server.ownerId,
        `⬇️ **${server.name}** 서버의 포인트 증설(RAM/CPU/저장공간)이 만료돼 원래 크기로 줄었어요. 계속 유지하려면 만료 전에 대시보드에서 갱신해주세요.`,
      );
      await prisma.auditLog.create({
        data: {
          action: "RESOURCE_UPGRADE_EXPIRED",
          targetType: "Server",
          targetId: server.id,
          metadata: { grantIds, deltaRam, deltaCpu, deltaDisk },
        },
      });
      console.log(`[cron] ${server.name} — 증설 ${grantIds.length}건 만료로 자동 축소`);
    } catch (err) {
      console.error(`[cron] ${server.name} 증설 만료 처리 실패:`, err);
    }
  }
}

async function handleScheduledBackups() {
  const servers = await prisma.server.findMany({
    where: { deletedAt: null, autoBackupEnabled: true, status: "RUNNING", pterodactylIdentifier: { not: null } },
  });

  for (const server of servers) {
    const dueMs = server.autoBackupIntervalHours * 60 * 60 * 1000;
    const last = server.lastBackupAt?.getTime() ?? 0;
    if (Date.now() - last < dueMs) continue;
    if (!server.pterodactylIdentifier) continue;

    try {
      const existing = await PteroClient.listBackups(server.pterodactylIdentifier);
      if (existing.length >= server.backupSlots) {
        console.log(`[cron] ${server.name} — 자동 백업 스킵(슬롯 가득 참)`);
        continue;
      }
      await PteroClient.createBackup(server.pterodactylIdentifier, `자동 백업 ${new Date().toLocaleString("ko-KR")}`);
      await prisma.server.update({ where: { id: server.id }, data: { lastBackupAt: new Date() } });
      await notifyOwner(server.ownerId, `💾 **${server.name}** 자동 백업이 완료됐어요.`);
      console.log(`[cron] ${server.name} — 자동 백업 생성`);
    } catch (err) {
      console.error(`[cron] ${server.name} 자동 백업 실패:`, err);
    }
  }
}

async function handleRestartWarnings(currentHourKst: number) {
  const warnHour = (currentHourKst + 1) % 24;
  const servers = await prisma.server.findMany({
    where: { deletedAt: null, autoRestartEnabled: true, autoRestartHour: warnHour, status: "RUNNING" },
  });

  for (const server of servers) {
    const action = "RESTART_WARNING";
    if (await recentlyLogged(action, server.id, REMINDER_COOLDOWN_HOURS)) continue;
    const sent = await notifyOwner(server.ownerId, `🔁 **${server.name}** 서버가 1시간 후 예약된 자동 재시작을 실행해요.`);
    await prisma.auditLog.create({
      data: { action, targetType: "Server", targetId: server.id, metadata: { discordNotified: sent } },
    });
  }
}

async function handleScheduledRestarts() {
  const currentHourKst = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Seoul" }).format(new Date()),
  );
  await handleRestartWarnings(currentHourKst);
  const today = new Date().toDateString();

  const servers = await prisma.server.findMany({
    where: {
      deletedAt: null,
      autoRestartEnabled: true,
      autoRestartHour: currentHourKst,
      status: "RUNNING",
      pterodactylIdentifier: { not: null },
    },
  });

  for (const server of servers) {
    if (server.lastAutoRestartAt && server.lastAutoRestartAt.toDateString() === today) continue;
    if (!server.pterodactylIdentifier) continue;
    try {
      await PteroClient.sendPowerAction(server.pterodactylIdentifier, "restart");
      await prisma.server.update({ where: { id: server.id }, data: { lastAutoRestartAt: new Date() } });
      console.log(`[cron] ${server.name} — 예약 재시작 실행`);
    } catch (err) {
      console.error(`[cron] ${server.name} 예약 재시작 실패:`, err);
    }
  }
}

async function handleNodeAlerts() {
  const nodes = await prisma.hostNode.findMany({ where: { status: "ONLINE" } });
  const usage = await prisma.server.groupBy({
    by: ["nodeId"],
    where: { deletedAt: null },
    _sum: { ramMb: true, cpuPercent: true },
  });
  const usageMap = new Map(usage.map((u) => [u.nodeId, u._sum]));

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) return;

  for (const node of nodes) {
    const used = usageMap.get(node.id) ?? { ramMb: 0, cpuPercent: 0 };
    const sellableRam = node.totalRamMb - node.reservedRamMb;
    const sellableCpu = node.cpuCores * 100;
    const ramRate = sellableRam > 0 ? (used.ramMb ?? 0) / sellableRam : 0;
    const cpuRate = sellableCpu > 0 ? (used.cpuPercent ?? 0) / sellableCpu : 0;

    const overloaded: string[] = [];
    if (ramRate >= NODE_ALERT_THRESHOLD) overloaded.push(`RAM ${(ramRate * 100).toFixed(0)}%`);
    if (cpuRate >= NODE_ALERT_THRESHOLD) overloaded.push(`CPU ${(cpuRate * 100).toFixed(0)}%`);
    if (overloaded.length === 0) continue;

    const action = "NODE_OVERLOAD_ALERT";
    if (await recentlyLogged(action, node.id, NODE_ALERT_COOLDOWN_HOURS)) continue;

    const sent = await notifyOwner(
      admin.id,
      `🚨 노드 **${node.name}**(${node.location}) 판매율이 높아요: ${overloaded.join(", ")}. 새 노드 추가를 검토해주세요.`,
    );
    await prisma.auditLog.create({
      data: {
        action,
        targetType: "HostNode",
        targetId: node.id,
        metadata: { ramRate, cpuRate, discordNotified: sent },
      },
    });
    console.log(`[cron] 노드 ${node.name} — 과부하 알림 ${sent ? "발송" : "스킵(관리자 디스코드 미연동)"}`);
  }
}

/**
 * 하나은행 API는 payaction/paysync 같은 SMS 대행 서비스와 달리 입금 발생 시 실시간으로
 * 알려주는 웹훅이 없다. 그래서 마지막으로 확인한 시각(lastCheckedAt) 이후의 거래내역을
 * 주기적으로 조회해서 "입금자명(적요) + 금액"이 정확히 일치하는 PENDING 주문을 찾아 매칭한다.
 */
async function handleHanaBankMatching() {
  const sync = await prisma.hanaBankSync.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  let deposits;
  try {
    deposits = await getRecentDeposits({ fromDate: sync.lastCheckedAt, toDate: new Date() });
  } catch (err) {
    console.error("[cron] 하나은행 거래내역 조회 실패:", err);
    return;
  }

  if (deposits.length > 0) {
    const pendingOrders = await prisma.order.findMany({ where: { status: "PENDING" } });

    for (const deposit of deposits) {
      const depositorName = deposit.printContent.trim();
      if (!isValidDepositorName(depositorName)) continue;

      const matchIndex = pendingOrders.findIndex(
        (o) => o.depositorName === depositorName && o.amountKrw === deposit.amount,
      );
      if (matchIndex === -1) continue;
      // 같은 사람이 같은 금액인 주문을 두 개 이상 갖고 있을 수 있어(예: 같은 요금제 갱신 2건),
      // 이번 배치 안에서 같은 주문에 입금이 중복 매칭되지 않게 바로 목록에서 뺀다
      const [match] = pendingOrders.splice(matchIndex, 1);

      try {
        await markOrderPaidAndFulfill(match.id);
        console.log(`[cron] 하나은행 입금 매칭 — 주문 ${match.id} (${depositorName}, ${deposit.amount}원)`);
      } catch (err) {
        console.error(`[cron] 주문 ${match.id} 처리 실패:`, err);
      }
    }
  }

  await prisma.hanaBankSync.update({ where: { id: 1 }, data: { lastCheckedAt: new Date() } });
}

/**
 * 결제(또는 포인트 교환)는 끝났지만 그 순간 노드에 여유가 없어서 "선주문" 상태로 대기 중인
 * 주문을 다시 배치해본다. 노드가 증설되거나 다른 서버가 삭제돼 자리가 나면 자동으로 풀린다.
 */
async function handlePreorderRetries() {
  const settings = await prisma.hostingSettings.findUnique({ where: { id: 1 } });
  if (settings && !settings.preorderAutoFulfillEnabled) {
    console.log("[cron] 선주문 자동 처리가 꺼져 있어요 — 관리자가 /admin/preorders에서 직접 처리해야 함");
    return;
  }

  const waiting = await prisma.order.findMany({
    where: { preorderWaiting: true, status: "PAID", serverId: null },
  });

  for (const order of waiting) {
    try {
      await retryPreorderFulfillment(order.id);
      console.log(`[cron] 선주문 ${order.id} — 노드 자리 확보돼 서버 생성 완료`);
    } catch (err) {
      if (err instanceof ProvisioningError) continue; // 아직도 자리 없음 — 다음 주기에 재시도
      console.error(`[cron] 선주문 ${order.id} 재배치 실패:`, err);
    }
  }
}

async function main() {
  console.log(`[cron] 시작 ${new Date().toISOString()}`);
  await handleServerStatusSync();
  await handleRenewals();
  await handleResourceUpgradeExpiry();
  await handleScheduledBackups();
  await handleScheduledRestarts();
  await handleNodeAlerts();
  await handleHanaBankMatching();
  await handlePreorderRetries();
  console.log(`[cron] 종료 ${new Date().toISOString()}`);
}

main()
  .catch((err) => {
    console.error("[cron] 처리 중 오류:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
