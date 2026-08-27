import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const schema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  ramMb: z.number().int().min(512).optional(),
  cpuPercent: z.number().int().min(25).optional(),
  diskMb: z.number().int().min(256).optional(),
  backupSlots: z.number().int().min(0).optional(),
  aiCreditsPerMonth: z.number().int().min(0).optional(),
  priceMonthlyKrw: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  allowedTemplateIds: z.array(z.string()).optional(),
  pointsRedeemable: z.boolean().optional(),
  pointsCost: z.number().int().min(0).optional(),
  preorderPriceKrw: z.number().int().min(0).nullable().optional(),
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
  const { allowedTemplateIds, ...data } = parsed.data;

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...data,
      ...(allowedTemplateIds
        ? { allowedTemplates: { set: allowedTemplateIds.map((tid) => ({ id: tid })) } }
        : {}),
    },
  });
  return NextResponse.json(product);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const orderCount = await prisma.order.count({ where: { productId: id } });
  if (orderCount === 0) {
    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ ok: true, deleted: true });
  }

  // 이미 주문 기록이 있는 상품은 완전히 지우면 과거 주문 내역이 깨지므로, 비활성화만 하고
  // 왜 완전히 삭제되지 않았는지 알려준다.
  await prisma.product.update({ where: { id }, data: { active: false } });
  return NextResponse.json({
    ok: true,
    deleted: false,
    message: `이미 ${orderCount}건의 주문 기록이 있어 완전히 삭제하지 않고 비활성화만 했어요.`,
  });
}
