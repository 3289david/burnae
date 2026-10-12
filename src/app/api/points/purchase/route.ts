import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { resolveDepositorName, isValidDepositorName } from "@/lib/hanabank";
import { markOrderPaidAndFulfill } from "@/lib/orderFulfillment";

/** 포인트 패키지 — 1원 = 1포인트 (AI 크레딧 단독 충전과 동일한 패턴) */
export const POINTS_PER_KRW = 1;
export const POINT_PACKAGES = [
  { points: 500, priceKrw: 500 },
  { points: 2500, priceKrw: 2500 },
  { points: 10000, priceKrw: 10000 },
] as const;

const schema = z.object({
  points: z.number().int(),
  depositorName: z.string().optional(),
});

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  const pkg = POINT_PACKAGES.find((p) => p.points === parsed.data.points);
  if (!pkg) return NextResponse.json({ error: "존재하지 않는 포인트 패키지입니다." }, { status: 404 });

  if (parsed.data.depositorName && !isValidDepositorName(parsed.data.depositorName)) {
    return NextResponse.json({ error: "입금자명은 공백 없이 1~5자여야 해요." }, { status: 422 });
  }

  const depositorName = parsed.data.depositorName ?? resolveDepositorName(user);
  const collidingPending = await prisma.order.findFirst({
    where: { depositorName, amountKrw: pkg.priceKrw, status: "PENDING" },
  });
  if (collidingPending) {
    return NextResponse.json(
      { error: "같은 입금자명+금액의 대기 중인 주문이 이미 있어요. 다른 입금자명을 사용해주세요." },
      { status: 409 },
    );
  }

  const order = await prisma.order.create({
    data: {
      userId: user.id,
      type: "POINTS",
      amountKrw: pkg.priceKrw,
      depositorName,
      pointsAmount: pkg.points,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  if (pkg.priceKrw <= 0) {
    await markOrderPaidAndFulfill(order.id);
    const refreshed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    return NextResponse.json(refreshed);
  }

  return NextResponse.json(order);
}
