import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { resolveDepositorName } from "@/lib/hanabank";
import { PteroApp, PteroClient } from "@/lib/pterodactyl";
import { getNodeFreeCapacity } from "@/lib/provisioning";

const schema = z.object({ productId: z.string(), usePoints: z.boolean().optional() });

async function applyPlanChange(
  server: { id: string; pterodactylServerId: number | null; pterodactylIdentifier: string | null; productId: string },
  targetProduct: { id: string; ramMb: number; diskMb: number; cpuPercent: number; backupSlots: number },
  actorUserId: string,
  extraMetadata: Record<string, unknown>,
) {
  await PteroApp.updateServerBuild(server.pterodactylServerId!, {
    memoryMb: targetProduct.ramMb,
    diskMb: targetProduct.diskMb,
    cpuPercent: targetProduct.cpuPercent,
    backupSlots: targetProduct.backupSlots,
  });
  await prisma.server.update({
    where: { id: server.id },
    data: {
      productId: targetProduct.id,
      ramMb: targetProduct.ramMb,
      diskMb: targetProduct.diskMb,
      cpuPercent: targetProduct.cpuPercent,
      backupSlots: targetProduct.backupSlots,
    },
  });
  await PteroClient.sendPowerAction(server.pterodactylIdentifier!, "restart");
  await prisma.auditLog.create({
    data: {
      actorUserId,
      action: "SERVER_PLAN_CHANGED",
      targetType: "Server",
      targetId: server.id,
      metadata: { from: server.productId, to: targetProduct.id, ...extraMetadata },
    },
  });
}

/**
 * 플랜 변경. 더 비싼 플랜이면 차액을 결제해야 적용되고(웹훅에서 실제 리소스 조정),
 * 더 싸거나 같은 플랜이면 환불 없이 즉시 적용한다. 대상 플랜이 홍보 포인트로 교환 가능한
 * 상품(pointsRedeemable)이면 결제 대신 포인트를 차감하고 바로 적용할 수도 있다.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const access = await authorizeServerAccess(user, id);
  if (!access) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (access.ownerId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "서버 소유자만 플랜을 바꿀 수 있어요." }, { status: 403 });
  }

  const server = await prisma.server.findUniqueOrThrow({ where: { id }, include: { product: true } });
  if (!server.pterodactylServerId || !server.pterodactylIdentifier) {
    return NextResponse.json({ error: "서버가 아직 준비 중입니다." }, { status: 409 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  const targetProduct = await prisma.product.findUnique({
    where: { id: parsed.data.productId, active: true },
    include: { allowedTemplates: { where: { id: server.templateId } } },
  });
  if (!targetProduct) return NextResponse.json({ error: "존재하지 않는 상품입니다." }, { status: 404 });
  if (targetProduct.allowedTemplates.length === 0) {
    return NextResponse.json({ error: "이 서버 종류에서는 선택할 수 없는 상품이에요." }, { status: 422 });
  }
  if (targetProduct.id === server.productId) {
    return NextResponse.json({ error: "이미 사용 중인 플랜이에요." }, { status: 409 });
  }

  const capacity = await getNodeFreeCapacity(server.nodeId, server.id);
  if (
    targetProduct.ramMb > capacity.freeRam ||
    targetProduct.diskMb > capacity.freeDisk ||
    targetProduct.cpuPercent > capacity.freeCpu
  ) {
    return NextResponse.json(
      { error: "이 서버가 배치된 노드에 여유 공간이 부족해 지금은 이 플랜으로 변경할 수 없어요." },
      { status: 409 },
    );
  }

  if (parsed.data.usePoints) {
    if (!targetProduct.pointsRedeemable || targetProduct.pointsCost == null) {
      return NextResponse.json({ error: "포인트로 교환할 수 없는 플랜이에요." }, { status: 422 });
    }
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (fresh.promotionPoints < targetProduct.pointsCost) {
      return NextResponse.json({ error: "포인트가 부족해요." }, { status: 422 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { promotionPoints: { decrement: targetProduct.pointsCost } },
    });
    await applyPlanChange(server, targetProduct, user.id, {
      via: "points",
      pointsSpent: targetProduct.pointsCost,
    });

    return NextResponse.json({ requiresPayment: false, applied: true, pointsSpent: targetProduct.pointsCost });
  }

  const priceDiff = targetProduct.priceMonthlyKrw - server.product.priceMonthlyKrw;

  if (priceDiff > 0) {
    const depositorName = resolveDepositorName(user);
    const collidingPending = await prisma.order.findFirst({
      where: { depositorName, amountKrw: priceDiff, status: "PENDING" },
    });
    if (collidingPending) {
      return NextResponse.json(
        { error: "같은 입금자명+금액의 대기 중인 주문이 이미 있어요. 계정 설정에서 입금자명을 바꿔주세요." },
        { status: 409 },
      );
    }
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        productId: targetProduct.id,
        serverId: server.id,
        type: "UPGRADE",
        amountKrw: priceDiff,
        depositorName,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    return NextResponse.json({ requiresPayment: true, order });
  }

  // 다운그레이드 또는 동일 가격 — 환불 없이 즉시 적용
  await applyPlanChange(server, targetProduct, user.id, { priceDiff });

  return NextResponse.json({ requiresPayment: false, applied: true });
}
