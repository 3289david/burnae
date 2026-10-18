import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/auth";
import { markOrderPaidAndFulfill } from "@/lib/orderFulfillment";

const schema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().max(500).optional(),
});

/**
 * UNDERPAID(부족 입금)·MANUAL_REVIEW(초과입금, 만료 후 늦은 입금 등) 상태의 코인 결제를
 * 관리자가 직접 승인/거절한다. 승인하면 실제로 들어온 금액과 무관하게 주문을 확정 처리한다
 * (고객이 부족하게 보냈어도 영업적으로 그냥 승인해줄 수도 있는 경우를 위함 — 반대로 진짜
 * 부족하면 거절하고 고객에게 추가 입금을 안내하면 된다).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminRole(["SUPER"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const payment = await prisma.cryptoPayment.findUnique({ where: { id } });
  if (!payment) return NextResponse.json({ error: "결제를 찾을 수 없습니다." }, { status: 404 });
  if (!["UNDERPAID", "MANUAL_REVIEW"].includes(payment.status)) {
    return NextResponse.json({ error: "지금은 검토할 수 없는 상태예요." }, { status: 409 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  const updated = await prisma.cryptoPayment.update({
    where: { id },
    data: {
      status: parsed.data.decision === "APPROVE" ? "CONFIRMED" : "FAILED",
      reviewedByUserId: admin.id,
      reviewNote: parsed.data.note ?? null,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "CRYPTO_PAYMENT_REVIEWED",
      targetType: "CryptoPayment",
      targetId: id,
      metadata: { decision: parsed.data.decision, note: parsed.data.note },
    },
  });

  if (parsed.data.decision === "APPROVE") {
    await markOrderPaidAndFulfill(payment.orderId);
  }

  return NextResponse.json(updated);
}
