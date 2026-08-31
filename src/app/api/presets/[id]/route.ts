import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const preset = await prisma.userPreset.findUnique({ where: { id } });
  if (!preset) return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
  if (preset.createdById !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  await prisma.userPreset.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
