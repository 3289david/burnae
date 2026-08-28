import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { PteroApp, PteroClient } from "@/lib/pterodactyl";
import { getNodeFreeCapacity } from "@/lib/provisioning";
import { withApiErrorHandling } from "@/lib/apiHandler";

const schema = z.object({ shopItemId: z.string() });

const RESOURCE_KINDS = ["RAM_UPGRADE", "CPU_UPGRADE", "DISK_UPGRADE", "BACKUP_SLOT_UPGRADE"] as const;

/**
 * 무료 서버 전용 — 플랜을 통째로 바꾸는 대신 램/CPU/디스크/백업 슬롯을 낱개로 포인트를 써서
 * 증설한다. 증설 항목(양/포인트 비용/한도)은 관리자가 /admin/shop에서 관리하는 ShopItem으로 결정된다.
 */
export const POST = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const access = await authorizeServerAccess(user, id);
  if (!access) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (access.ownerId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "서버 소유자만 증설할 수 있어요." }, { status: 403 });
  }

  const server = await prisma.server.findUniqueOrThrow({ where: { id }, include: { product: true } });
  if (!server.pterodactylServerId || !server.pterodactylIdentifier) {
    return NextResponse.json({ error: "서버가 아직 준비 중입니다." }, { status: 409 });
  }
  if (!server.product.pointsRedeemable) {
    return NextResponse.json({ error: "무료 서버만 포인트로 증설할 수 있어요." }, { status: 422 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  const item = await prisma.shopItem.findUnique({ where: { id: parsed.data.shopItemId, active: true } });
  if (!item || !RESOURCE_KINDS.includes(item.kind as (typeof RESOURCE_KINDS)[number]) || !item.amount) {
    return NextResponse.json({ error: "존재하지 않는 증설 항목입니다." }, { status: 404 });
  }

  const nextRamMb = item.kind === "RAM_UPGRADE" ? server.ramMb + item.amount : server.ramMb;
  const nextCpuPercent = item.kind === "CPU_UPGRADE" ? server.cpuPercent + item.amount : server.cpuPercent;
  const nextDiskMb = item.kind === "DISK_UPGRADE" ? server.diskMb + item.amount : server.diskMb;
  const nextBackupSlots = item.kind === "BACKUP_SLOT_UPGRADE" ? server.backupSlots + item.amount : server.backupSlots;

  const currentTotal = {
    RAM_UPGRADE: server.ramMb,
    CPU_UPGRADE: server.cpuPercent,
    DISK_UPGRADE: server.diskMb,
    BACKUP_SLOT_UPGRADE: server.backupSlots,
  }[item.kind as (typeof RESOURCE_KINDS)[number]];
  if (item.maxTotal != null && currentTotal + item.amount > item.maxTotal) {
    return NextResponse.json({ error: "이 항목은 이미 최대치까지 증설했어요." }, { status: 422 });
  }

  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (fresh.promotionPoints < item.pointsCost) {
    return NextResponse.json(
      { error: `포인트가 부족해요. (필요 ${item.pointsCost.toLocaleString()}P, 보유 ${fresh.promotionPoints.toLocaleString()}P)` },
      { status: 422 },
    );
  }

  if (item.kind === "RAM_UPGRADE" || item.kind === "CPU_UPGRADE" || item.kind === "DISK_UPGRADE") {
    const capacity = await getNodeFreeCapacity(server.nodeId, server.id);
    if (
      nextRamMb > server.ramMb + capacity.freeRam ||
      nextCpuPercent > server.cpuPercent + capacity.freeCpu ||
      nextDiskMb > server.diskMb + capacity.freeDisk
    ) {
      return NextResponse.json(
        { error: "이 서버가 배치된 노드에 여유 공간이 부족해 지금은 증설할 수 없어요." },
        { status: 409 },
      );
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { promotionPoints: { decrement: item.pointsCost } },
  });

  await PteroApp.updateServerBuild(server.pterodactylServerId, {
    memoryMb: nextRamMb,
    diskMb: nextDiskMb,
    cpuPercent: nextCpuPercent,
    backupSlots: nextBackupSlots,
  });
  await prisma.server.update({
    where: { id: server.id },
    data: { ramMb: nextRamMb, cpuPercent: nextCpuPercent, diskMb: nextDiskMb, backupSlots: nextBackupSlots },
  });
  await PteroClient.sendPowerAction(server.pterodactylIdentifier, "restart");

  await prisma.shopRedemption.create({
    data: { userId: user.id, itemId: item.id, pointsSpent: item.pointsCost },
  });
  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "SERVER_FREE_UPGRADE",
      targetType: "Server",
      targetId: server.id,
      metadata: { itemId: item.id, kind: item.kind, pointsSpent: item.pointsCost },
    },
  });

  return NextResponse.json({
    ok: true,
    pointsSpent: item.pointsCost,
    ramMb: nextRamMb,
    cpuPercent: nextCpuPercent,
    diskMb: nextDiskMb,
    backupSlots: nextBackupSlots,
  });
});
