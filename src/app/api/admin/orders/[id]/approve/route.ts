import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { markOrderPaidAndFulfill } from "@/lib/orderFulfillment";

/**
 * 하나은행 자동 매칭을 기다리지 않고 관리자가 직접 "입금 확인됨" 처리한다
 * (계좌 문자로 먼저 확인했거나, 다른 방법으로 입금을 확인한 경우 등).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  if (order.status === "PAID") return NextResponse.json({ error: "이미 처리된 주문이에요." }, { status: 409 });

  await markOrderPaidAndFulfill(id);

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "ORDER_MANUALLY_APPROVED",
      targetType: "Order",
      targetId: id,
      metadata: { amountKrw: order.amountKrw, depositorName: order.depositorName },
    },
  });

  return NextResponse.json({ ok: true });
}
