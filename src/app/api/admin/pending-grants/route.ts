import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

/** 관리자가 지급했지만 유저가 아직 서버 종류를 고르지 않은(=아직 서버가 만들어지지 않은) 건 목록 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const orders = await prisma.order.findMany({
    where: { type: "NEW_SERVER", status: "PAID", serverId: null, templateIdRequested: null, isAdminGrant: true },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, email: true } } },
  });
  return NextResponse.json(orders);
}
