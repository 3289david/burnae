import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/auth";

export async function GET() {
  const admin = await requireAdminRole(["COMMUNITY", "GENERAL", "SUPER"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const [totalTracked, aggregate, top] = await Promise.all([
    prisma.userActivityLevel.count(),
    prisma.userActivityLevel.aggregate({ _sum: { xp: true, messageCount: true }, _avg: { level: true } }),
    prisma.userActivityLevel.findMany({ orderBy: { xp: "desc" }, take: 50 }),
  ]);

  return NextResponse.json({
    totalTracked,
    totalXp: aggregate._sum.xp ?? 0,
    totalMessages: aggregate._sum.messageCount ?? 0,
    averageLevel: Math.round((aggregate._avg.level ?? 0) * 10) / 10,
    top,
  });
}
