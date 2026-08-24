import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const schema = z.object({
  active: z.boolean().optional(),
  pointsAwarded: z.number().int().min(0).optional(),
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  requiredText: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
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

  const task = await prisma.promotionTask.update({ where: { id }, data: parsed.data });
  return NextResponse.json(task);
}
