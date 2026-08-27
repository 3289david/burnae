import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { markOrderPaidAndFulfill } from "@/lib/orderFulfillment";

const schema = z.object({
  productId: z.string(),
  templateId: z.string(),
  minecraftVersion: z.string(),
  serverName: z.string().min(2).max(24),
});

/** 홍보 포인트로 무료 서버(예: 1GB RAM / 0.5vCPU / 500MB) 등 포인트 교환 상품을 즉시 결제 없이 발급한다 */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 422 });
  }
  const input = parsed.data;

  const product = await prisma.product.findUnique({
    where: { id: input.productId, active: true },
    include: { allowedTemplates: true },
  });
  if (!product || !product.pointsRedeemable || product.pointsCost == null) {
    return NextResponse.json({ error: "포인트로 교환할 수 없는 상품이에요." }, { status: 404 });
  }
  if (!product.allowedTemplates.some((t) => t.id === input.templateId)) {
    return NextResponse.json({ error: "이 상품에서 선택할 수 없는 서버 종류입니다." }, { status: 422 });
  }

  const existingFreeServer = await prisma.server.findFirst({
    where: { ownerId: user.id, productId: product.id, deletedAt: null },
  });
  if (existingFreeServer) {
    return NextResponse.json({ error: "이미 이 상품으로 만든 서버가 있어요." }, { status: 409 });
  }

  let orderId: string;
  try {
    const order = await prisma.$transaction(async (tx) => {
      const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (fresh.promotionPoints < product.pointsCost!) {
        throw new Error("포인트가 부족해요.");
      }
      await tx.user.update({
        where: { id: user.id },
        data: { promotionPoints: { decrement: product.pointsCost! } },
      });
      return tx.order.create({
        data: {
          userId: user.id,
          productId: product.id,
          productNameSnapshot: product.name,
          type: "NEW_SERVER",
          amountKrw: 0,
          depositorName: "포인트",
          status: "PAID",
          paidAt: new Date(),
          serverNameRequested: input.serverName,
          templateIdRequested: input.templateId,
          minecraftVersionRequested: input.minecraftVersion,
        },
      });
    });
    orderId = order.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : "교환에 실패했어요.";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  try {
    await markOrderPaidAndFulfill(orderId);
  } catch (err) {
    console.error("[promotions/redeem] 서버 생성 실패:", err);
    // 결제(포인트 차감)는 이미 끝났고, 배치 실패는 markOrderPaidAndFulfill 내부에서
    // ProvisioningError면 "선주문" 대기로 전환되므로 여기선 별도 롤백하지 않는다.
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  return NextResponse.json(order);
}
