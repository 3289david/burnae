import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { createInvoice, buildDepositorName } from "@/lib/paysync";

/** 다음 결제일을 미리 연장하고 싶을 때(만료 전이라도) 스스로 결제할 수 있는 갱신 주문 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const access = await authorizeServerAccess(user, id);
  if (!access) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (access.ownerId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "서버 소유자만 갱신할 수 있어요." }, { status: 403 });
  }

  const server = await prisma.server.findUniqueOrThrow({ where: { id }, include: { product: true } });

  const existingPending = await prisma.order.findFirst({
    where: { serverId: id, type: "RENEWAL", status: "PENDING" },
  });
  if (existingPending) {
    return NextResponse.json({ requiresPayment: true, order: existingPending });
  }

  const depositorName = buildDepositorName(user.name, user.id);
  const order = await prisma.order.create({
    data: {
      userId: user.id,
      productId: server.productId,
      serverId: server.id,
      type: "RENEWAL",
      amountKrw: server.product.priceMonthlyKrw,
      depositorName,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  try {
    const invoice = await createInvoice({
      depositorName,
      amountKrw: order.amountKrw,
      orderId: order.id,
      expireAfter: "1d",
    });
    await prisma.order.update({ where: { id: order.id }, data: { paysyncInvoiceId: invoice.id } });
    return NextResponse.json({ requiresPayment: true, order: { ...order, paysyncInvoiceId: invoice.id } });
  } catch (err) {
    console.error("[renew] 페이싱크 인보이스 생성 실패:", err);
    return NextResponse.json({ error: "결제 준비 중 오류가 발생했습니다." }, { status: 502 });
  }
}
