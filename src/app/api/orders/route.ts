import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { resolveDepositorName, isValidDepositorName } from "@/lib/hanabank";
import { hasNodeCapacity } from "@/lib/provisioning";

const schema = z.object({
  productId: z.string(),
  templateId: z.string(),
  minecraftVersion: z.string(),
  serverName: z.string().min(2).max(24),
  couponCode: z.string().optional(),
  depositorName: z.string().optional(),
});

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      product: true,
      server: { select: { id: true, name: true, subdomains: { select: { subdomain: true } } } },
    },
  });
  return NextResponse.json(orders);
}

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
  if (!product) {
    return NextResponse.json({ error: "존재하지 않는 상품입니다." }, { status: 404 });
  }
  const templateAllowed = product.allowedTemplates.some((t) => t.id === input.templateId);
  if (!templateAllowed) {
    return NextResponse.json(
      { error: "이 상품에서 선택할 수 없는 서버 종류입니다." },
      { status: 422 },
    );
  }

  // 지금 이 상품을 배치할 노드 자리가 없으면 "선주문"으로 진행 — 가격은 관리자가 상품별로 따로
  // 지정한 선주문가(preorderPriceKrw)가 있으면 그걸, 없으면 정가를 그대로 쓴다.
  const hasCapacity = await hasNodeCapacity(product.ramMb, product.diskMb, product.cpuPercent);
  const isPreorder = !hasCapacity;
  const basePrice = isPreorder && product.preorderPriceKrw != null ? product.preorderPriceKrw : product.priceMonthlyKrw;

  let discountKrw = 0;
  let couponId: string | undefined;
  if (input.couponCode) {
    const coupon = await prisma.coupon.findUnique({ where: { code: input.couponCode } });
    const now = new Date();
    const valid =
      coupon &&
      coupon.active &&
      (!coupon.startsAt || coupon.startsAt <= now) &&
      (!coupon.expiresAt || coupon.expiresAt >= now) &&
      (!coupon.maxUses || coupon.usedCount < coupon.maxUses) &&
      basePrice >= coupon.minOrderKrw;
    if (!valid) {
      return NextResponse.json(
        { error: "사용할 수 없는 쿠폰 코드입니다." },
        { status: 422 },
      );
    }
    const alreadyUsed = await prisma.couponRedemption.findUnique({
      where: { couponId_userId: { couponId: coupon!.id, userId: user.id } },
    });
    if (alreadyUsed) {
      return NextResponse.json(
        { error: "이미 사용한 쿠폰입니다." },
        { status: 422 },
      );
    }
    couponId = coupon!.id;
    discountKrw =
      coupon!.discountType === "PERCENT"
        ? Math.floor((basePrice * coupon!.discountValue) / 100)
        : coupon!.discountValue;
    discountKrw = Math.min(discountKrw, basePrice - 100);
  }

  if (input.depositorName && !isValidDepositorName(input.depositorName)) {
    return NextResponse.json(
      { error: "입금자명은 공백 없이 1~5자여야 해요." },
      { status: 422 },
    );
  }

  const amountKrw = basePrice - discountKrw;
  const depositorName = input.depositorName ?? resolveDepositorName(user);

  const collidingPending = await prisma.order.findFirst({
    where: { depositorName, amountKrw, status: "PENDING" },
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
      productId: product.id,
      type: "NEW_SERVER",
      amountKrw,
      discountKrw,
      couponId,
      depositorName,
      isPreorder,
      serverNameRequested: input.serverName,
      templateIdRequested: input.templateId,
      minecraftVersionRequested: input.minecraftVersion,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  if (couponId) {
    await prisma.couponRedemption.create({ data: { couponId, userId: user.id } });
  }

  return NextResponse.json(order);
}
