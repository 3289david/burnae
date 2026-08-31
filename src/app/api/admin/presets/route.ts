import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const presets = await prisma.userPreset.findMany({
    orderBy: [{ delisted: "desc" }, { reportCount: "desc" }, { createdAt: "desc" }],
    include: {
      createdBy: { select: { id: true, name: true, email: true, role: true } },
      baseTemplate: { select: { displayName: true } },
      reports: { select: { reason: true, createdAt: true, reporterId: true } },
    },
  });

  return NextResponse.json(presets);
}
