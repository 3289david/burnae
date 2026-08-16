import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createInvoice, buildDepositorName } from "@/lib/paysync";

const schema = z.object({
  productId: z.string(),
  templateId: z.string(),
  minecraftVersion: z.string(),
  serverName: z.string().min(2).max(24),
  couponCode: z.string().optional(),
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
      product.priceMonthlyKrw >= coupon.minOrderKrw;
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
        ? Math.floor((product.priceMonthlyKrw * coupon!.discountValue) / 100)
        : coupon!.discountValue;
    discountKrw = Math.min(discountKrw, product.priceMonthlyKrw - 100);
  }

  const amountKrw = product.priceMonthlyKrw - discountKrw;
  const depositorName = buildDepositorName(user.name, user.id);

  const order = await prisma.order.create({
    data: {
      userId: user.id,
      productId: product.id,
      type: "NEW_SERVER",
      amountKrw,
      discountKrw,
      couponId,
      depositorName,
      serverNameRequested: input.serverName,
      templateIdRequested: input.templateId,
      minecraftVersionRequested: input.minecraftVersion,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  if (couponId) {
    await prisma.couponRedemption.create({ data: { couponId, userId: user.id } });
  }

  try {
    const invoice = await createInvoice({
      depositorName,
      amountKrw,
      orderId: order.id,
      expireAfter: "1d",
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { paysyncInvoiceId: invoice.id },
    });
    return NextResponse.json({ ...order, paysyncInvoiceId: invoice.id });
  } catch (err) {
    console.error("[orders] 페이싱크 인보이스 생성 실패:", err);
    return NextResponse.json(
      { error: "결제 준비 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." },
      { status: 502 },
    );
  }
}
