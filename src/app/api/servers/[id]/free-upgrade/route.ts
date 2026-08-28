import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { PteroApp, PteroClient } from "@/lib/pterodactyl";
import { getNodeFreeCapacity } from "@/lib/provisioning";
import { withApiErrorHandling } from "@/lib/apiHandler";

const schema = z.object({ resource: z.enum(["ram", "cpu", "backupSlot"]) });

/** 포인트로 낱개 증설할 때 한 번에 늘어나는 양 / 드는 포인트 / 최대 한도 */
const STEPS = {
  ram: { amount: 512, unit: "RAM +0.5GB", pointsCost: 300, max: 4096 },
  cpu: { amount: 25, unit: "CPU +25%", pointsCost: 250, max: 200 },
  backupSlot: { amount: 1, unit: "백업 슬롯 +1개", pointsCost: 400, max: 5 },
} as const;

/**
 * 무료 서버 전용 — 플랜을 통째로 바꾸는 대신 램/CPU/백업 슬롯을 낱개로 포인트를 써서 증설한다.
 * 저장공간(디스크)은 서버당 고정이라 증설 대상에 포함하지 않는다.
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
  const step = STEPS[parsed.data.resource];

  const nextRamMb = parsed.data.resource === "ram" ? server.ramMb + step.amount : server.ramMb;
  const nextCpuPercent = parsed.data.resource === "cpu" ? server.cpuPercent + step.amount : server.cpuPercent;
  const nextBackupSlots = parsed.data.resource === "backupSlot" ? server.backupSlots + step.amount : server.backupSlots;

  const current = { ram: server.ramMb, cpu: server.cpuPercent, backupSlot: server.backupSlots }[parsed.data.resource];
  if (current + step.amount > step.max) {
    return NextResponse.json({ error: `이 항목은 최대 ${step.max}${parsed.data.resource === "cpu" ? "%" : parsed.data.resource === "ram" ? "MB" : "개"}까지만 증설할 수 있어요.` }, { status: 422 });
  }

  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (fresh.promotionPoints < step.pointsCost) {
    return NextResponse.json({ error: `포인트가 부족해요. (필요 ${step.pointsCost.toLocaleString()}P, 보유 ${fresh.promotionPoints.toLocaleString()}P)` }, { status: 422 });
  }

  if (parsed.data.resource === "ram" || parsed.data.resource === "cpu") {
    const capacity = await getNodeFreeCapacity(server.nodeId, server.id);
    if (nextRamMb > server.ramMb + capacity.freeRam || nextCpuPercent > server.cpuPercent + capacity.freeCpu) {
      return NextResponse.json(
        { error: "이 서버가 배치된 노드에 여유 공간이 부족해 지금은 증설할 수 없어요." },
        { status: 409 },
      );
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { promotionPoints: { decrement: step.pointsCost } },
  });

  await PteroApp.updateServerBuild(server.pterodactylServerId, {
    memoryMb: nextRamMb,
    diskMb: server.diskMb,
    cpuPercent: nextCpuPercent,
    backupSlots: nextBackupSlots,
  });
  await prisma.server.update({
    where: { id: server.id },
    data: { ramMb: nextRamMb, cpuPercent: nextCpuPercent, backupSlots: nextBackupSlots },
  });
  await PteroClient.sendPowerAction(server.pterodactylIdentifier, "restart");

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "SERVER_FREE_UPGRADE",
      targetType: "Server",
      targetId: server.id,
      metadata: { resource: parsed.data.resource, pointsSpent: step.pointsCost },
    },
  });

  return NextResponse.json({
    ok: true,
    pointsSpent: step.pointsCost,
    ramMb: nextRamMb,
    cpuPercent: nextCpuPercent,
    backupSlots: nextBackupSlots,
  });
});
