import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { markOrderPaidAndFulfill } from "@/lib/orderFulfillment";
import { withApiErrorHandling } from "@/lib/apiHandler";

const schema = z.object({ couponCode: z.string().min(1) });

/**
 * 결제 대기 중인 주문에 쿠폰을 나중에(입금 안내 화면에서) 적용한다 — 서버 생성 폼에서
 * 미리 입력받던 걸 결제 화면으로 옮겼다. 이미 쿠폰이 적용된 주문엔 다시 적용할 수 없다
 * (교체 로직까지 만들면 복잡해지는데, 안 쓴 쿠폰을 다시 입력하는 경우가 거의 없어서 생략).
 */
export const POST = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "쿠폰 코드를 입력해주세요." }, { status: 422 });

  const order = await prisma.order.findFirst({ where: { id, userId: user.id } });
  if (!order) return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  if (order.status !== "PENDING") {
    return NextResponse.json({ error: "입금 대기 중인 주문에만 쿠폰을 쓸 수 있어요." }, { status: 409 });
  }
  if (order.couponId) {
    return NextResponse.json({ error: "이미 쿠폰이 적용된 주문이에요." }, { status: 409 });
  }

  // 할인 전 기준가 — 지금까지 쿠폰이 없었으니 order.amountKrw가 그대로 기준가다
  const basePrice = order.amountKrw;

  const coupon = await prisma.coupon.findUnique({ where: { code: parsed.data.couponCode } });
  const now = new Date();
  const valid =
    coupon &&
    coupon.active &&
    (!coupon.startsAt || coupon.startsAt <= now) &&
    (!coupon.expiresAt || coupon.expiresAt >= now) &&
    (!coupon.maxUses || coupon.usedCount < coupon.maxUses) &&
    basePrice >= coupon.minOrderKrw;
  if (!valid) {
    return NextResponse.json({ error: "사용할 수 없는 쿠폰 코드입니다." }, { status: 422 });
  }

  const alreadyUsed = await prisma.couponRedemption.findUnique({
    where: { couponId_userId: { couponId: coupon.id, userId: user.id } },
  });
  if (alreadyUsed) {
    return NextResponse.json({ error: "이미 사용한 쿠폰입니다." }, { status: 422 });
  }

  let discountKrw =
    coupon.discountType === "PERCENT" ? Math.floor((basePrice * coupon.discountValue) / 100) : coupon.discountValue;
  discountKrw = basePrice <= 100 ? 0 : Math.min(discountKrw, basePrice - 100);
  const amountKrw = basePrice - discountKrw;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { discountKrw, amountKrw, couponId: coupon.id } });
      await tx.couponRedemption.create({ data: { couponId: coupon.id, userId: user.id } });
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "이미 사용한 쿠폰입니다." }, { status: 422 });
    }
    throw err;
  }

  if (amountKrw <= 0) {
    await markOrderPaidAndFulfill(order.id);
  }

  const refreshed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  return NextResponse.json(refreshed);
});
