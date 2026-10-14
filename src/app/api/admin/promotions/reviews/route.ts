import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/auth";

export async function GET() {
  const admin = await requireAdminRole(["PROMOTION", "SUPER"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const pending = await prisma.promotionCompletion.findMany({
    where: { status: "PENDING_REVIEW" },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { name: true, email: true } }, task: { select: { title: true } } },
  });
  return NextResponse.json(pending);
}
