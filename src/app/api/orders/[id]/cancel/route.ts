import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/**
 * 관리자가 지급했지만 아직 서버 종류를 고르지 않은 주문(지급된 서버)을 취소한다.
 * 결제나 포인트 차감이 없는 지급 건이라 되돌릴 것도 없이 상태만 CANCELLED로 바꾸면 된다.
 * 본인(유저)이 취소하거나, 관리자가 잘못 지급한 건을 대신 취소할 수도 있다.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const order = await prisma.order.findFirst({
    where: user.role === "ADMIN" ? { id } : { id, userId: user.id },
  });
  if (!order) return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  if (order.type !== "NEW_SERVER" || order.status !== "PAID" || order.serverId || order.templateIdRequested) {
    return NextResponse.json({ error: "취소할 수 없는 주문이에요." }, { status: 409 });
  }

  await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
  return NextResponse.json({ ok: true });
}
