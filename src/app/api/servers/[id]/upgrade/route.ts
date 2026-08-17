import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { createInvoice, resolveDepositorName } from "@/lib/paysync";
import { PteroApp, PteroClient } from "@/lib/pterodactyl";

const schema = z.object({ productId: z.string() });

/**
 * 플랜 변경. 더 비싼 플랜이면 차액을 결제해야 적용되고(webhook에서 실제 리소스 조정),
 * 더 싸거나 같은 플랜이면 환불 없이 즉시 적용한다.
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

    try {
      const invoice = await createInvoice({
        depositorName,
        amountKrw: priceDiff,
        orderId: order.id,
        expireAfter: "1d",
      });
      await prisma.order.update({ where: { id: order.id }, data: { paysyncInvoiceId: invoice.id } });
      return NextResponse.json({ requiresPayment: true, order: { ...order, paysyncInvoiceId: invoice.id } });
    } catch (err) {
      console.error("[upgrade] 페이싱크 인보이스 생성 실패:", err);
      return NextResponse.json({ error: "결제 준비 중 오류가 발생했습니다." }, { status: 502 });
    }
  }

  // 다운그레이드 또는 동일 가격 — 환불 없이 즉시 적용
  await PteroApp.updateServerBuild(server.pterodactylServerId, {
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
  await PteroClient.sendPowerAction(server.pterodactylIdentifier, "restart");
  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "SERVER_PLAN_CHANGED",
      targetType: "Server",
      targetId: server.id,
      metadata: { from: server.productId, to: targetProduct.id, priceDiff },
    },
  });

  return NextResponse.json({ requiresPayment: false, applied: true });
}
