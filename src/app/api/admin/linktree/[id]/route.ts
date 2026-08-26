import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { syncLinktreeMessage } from "@/lib/discordBoards";

const schema = z.object({
  label: z.string().min(1).max(80).optional(),
  url: z.string().url().optional(),
  emoji: z.string().max(8).optional().nullable(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 422 });
  }

  const link = await prisma.linktreeLink.update({ where: { id }, data: parsed.data });
  await syncLinktreeMessage().catch((err) => console.error("[linktree] 디스코드 반영 실패:", err));
  return NextResponse.json(link);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  await prisma.linktreeLink.delete({ where: { id } });
  await syncLinktreeMessage().catch((err) => console.error("[linktree] 디스코드 반영 실패:", err));
  return NextResponse.json({ ok: true });
}
