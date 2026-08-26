import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

/** 결제(또는 포인트 교환)는 끝났지만 아직 노드 자리가 없어서 대기 중인 "선주문" 목록 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const preorders = await prisma.order.findMany({
    where: { preorderWaiting: true, status: "PAID", serverId: null },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { name: true, email: true } }, product: { select: { name: true } } },
  });
  return NextResponse.json(preorders);
}
