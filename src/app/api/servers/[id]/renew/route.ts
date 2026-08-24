import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { resolveDepositorName } from "@/lib/hanabank";

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

  const depositorName = resolveDepositorName(user);
  const collidingPending = await prisma.order.findFirst({
    where: { depositorName, amountKrw: server.product.priceMonthlyKrw, status: "PENDING" },
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
      productId: server.productId,
      serverId: server.id,
      type: "RENEWAL",
      amountKrw: server.product.priceMonthlyKrw,
      depositorName,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  return NextResponse.json({ requiresPayment: true, order });
}
