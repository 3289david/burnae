import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PteroApp, PteroClient } from "../src/lib/pterodactyl";
import { sendDiscordDM } from "../src/lib/discordNotify";
import { deleteServerFully } from "../src/lib/provisioning";

/**
 * 주기적으로(예: 30분~1시간마다) 실행하는 운영 크론.
 * systemd timer(deploy/burnae-maintenance.timer)로 등록해서 돌린다. 1회 실행하고 종료.
 *
 * 하는 일:
 *   1. 결제 만료 임박(D-3/D-1) 알림 → 연체 시 정지 → 정지 후 보관기간 지나면 삭제
 *   2. 예약 자동 백업 / 예약 자동 재시작
 *   3. 노드 RAM 판매율 과부하 시 관리자에게 알림
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
    const daysLeft = Math.ceil((server.renewalDueAt!.getTime() - now) / (24 * 60 * 60 * 1000));
    if (daysLeft !== 3 && daysLeft !== 1) continue;

    const action = `RENEWAL_REMINDER_D${daysLeft}`;
    if (await recentlyLogged(action, server.id, REMINDER_COOLDOWN_HOURS)) continue;

    const sent = await notifyOwner(
      server.ownerId,
      `⏰ **${server.name}** 서버 결제 만료가 ${daysLeft}일 남았어요. burnae.kr 대시보드에서 미리 갱신해주세요.`,
    );
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
    await prisma.server.update({
      where: { id: server.id },
      data: { status: "SUSPENDED", suspendedReason: "결제 만료" },
    });
    await notifyOwner(
      server.ownerId,
      `⛔ **${server.name}** 서버가 결제 만료로 일시정지됐어요. ${RETENTION_DAYS}일 안에 갱신하지 않으면 삭제돼요.`,
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
      console.log(`[cron] ${server.name} — 자동 백업 생성`);
    } catch (err) {
      console.error(`[cron] ${server.name} 자동 백업 실패:`, err);
    }
  }
}

async function handleScheduledRestarts() {
  const currentHourKst = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Seoul" }).format(new Date()),
  );
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
    _sum: { ramMb: true },
  });
  const usageMap = new Map(usage.map((u) => [u.nodeId, u._sum.ramMb ?? 0]));

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) return;

  for (const node of nodes) {
    const sellable = node.totalRamMb - node.reservedRamMb;
    const used = usageMap.get(node.id) ?? 0;
    if (sellable <= 0) continue;
    const rate = used / sellable;
    if (rate < NODE_ALERT_THRESHOLD) continue;

    const action = "NODE_RAM_OVERLOAD_ALERT";
    if (await recentlyLogged(action, node.id, NODE_ALERT_COOLDOWN_HOURS)) continue;

    const sent = await notifyOwner(
      admin.id,
      `🚨 노드 **${node.name}**(${node.location}) RAM 판매율이 ${(rate * 100).toFixed(0)}%예요. 새 노드 추가를 검토해주세요.`,
    );
    await prisma.auditLog.create({
      data: { action, targetType: "HostNode", targetId: node.id, metadata: { rate, discordNotified: sent } },
    });
    console.log(`[cron] 노드 ${node.name} — 과부하 알림 ${sent ? "발송" : "스킵(관리자 디스코드 미연동)"}`);
  }
}

async function main() {
  console.log(`[cron] 시작 ${new Date().toISOString()}`);
  await handleRenewals();
  await handleScheduledBackups();
  await handleScheduledRestarts();
  await handleNodeAlerts();
  console.log(`[cron] 종료 ${new Date().toISOString()}`);
}

main()
  .catch((err) => {
    console.error("[cron] 처리 중 오류:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
