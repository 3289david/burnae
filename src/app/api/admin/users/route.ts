import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      aiCreditsRemaining: true,
      promotionPoints: true,
      createdAt: true,
      discordLink: { select: { discordUserId: true } },
      _count: { select: { servers: { where: { deletedAt: null } } } },
    },
  });
  return NextResponse.json(users);
}
