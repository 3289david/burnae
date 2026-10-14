import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/auth";

export async function GET() {
  const admin = await requireAdminRole(["PROMOTION", "SUPER"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const tasks = await prisma.promotionTask.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { completions: { where: { status: "APPROVED" } } } } },
  });

  return NextResponse.json(
    tasks.map(({ _count, ...t }) => ({ ...t, completedCount: _count.completions })),
  );
}
