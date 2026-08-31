import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { revokeCustomPresetPoints } from "@/lib/promotions";

const patchSchema = z.object({ delisted: z.boolean() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 422 });

  const preset = await prisma.userPreset.findUniqueOrThrow({ where: { id } });
  await prisma.userPreset.update({ where: { id }, data: { delisted: parsed.data.delisted } });

  if (parsed.data.delisted && !preset.delisted) {
    await revokeCustomPresetPoints(id, preset.createdById);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  await prisma.userPreset.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
