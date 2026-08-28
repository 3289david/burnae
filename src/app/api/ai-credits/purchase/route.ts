import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { resolveDepositorName, isValidDepositorName } from "@/lib/hanabank";
import { markOrderPaidAndFulfill } from "@/lib/orderFulfillment";

/** 크레딧 패키지 — 결제 없이 플랜에 딸려오는 게 아니라 단독으로 충전할 때 고를 수 있는 옵션들 */
export const AI_CREDIT_PACKAGES = [
  { credits: 100, priceKrw: 3000 },
  { credits: 500, priceKrw: 12000 },
  { credits: 1500, priceKrw: 30000 },
] as const;

const schema = z.object({
  credits: z.number().int(),
  depositorName: z.string().optional(),
});

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  const pkg = AI_CREDIT_PACKAGES.find((p) => p.credits === parsed.data.credits);
  if (!pkg) return NextResponse.json({ error: "존재하지 않는 크레딧 패키지입니다." }, { status: 404 });

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
      type: "AI_CREDITS",
      amountKrw: pkg.priceKrw,
      depositorName,
      aiCreditsAmount: pkg.credits,
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
