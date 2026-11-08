import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/auth";

const schema = z.object({
  level: z.number().int().min(1).optional(),
  discordRoleId: z.string().min(1).optional(),
  name: z.string().min(1).max(80).optional(),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminRole(["GENERAL", "SUPER"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 422 });
  }

  const item = await prisma.levelRole.update({ where: { id }, data: parsed.data });
  return NextResponse.json(item);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminRole(["GENERAL", "SUPER"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  await prisma.levelRole.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
