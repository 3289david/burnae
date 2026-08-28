import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const schema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  pointsCost: z.number().int().min(1).optional(),
  amount: z.number().int().min(1).optional(),
  maxTotal: z.number().int().min(1).nullable().optional(),
  durationDays: z.number().int().min(1).nullable().optional(),
  active: z.boolean().optional(),
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
  if (!parsed.success) return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 422 });

  const item = await prisma.shopItem.update({ where: { id }, data: parsed.data });
  return NextResponse.json(item);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const redemptionCount = await prisma.shopRedemption.count({ where: { itemId: id } });
  if (redemptionCount > 0) {
    await prisma.shopItem.update({ where: { id }, data: { active: false } });
    return NextResponse.json({
      ok: true,
      deleted: false,
      message: `이미 ${redemptionCount}건의 교환 기록이 있어 완전히 삭제하지 않고 비활성화만 했어요.`,
    });
  }

  await prisma.shopItem.delete({ where: { id } });
  return NextResponse.json({ ok: true, deleted: true });
}
