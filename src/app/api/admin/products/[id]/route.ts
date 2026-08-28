import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { withApiErrorHandling } from "@/lib/apiHandler";

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

export const PUT = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
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
});

export const DELETE = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  // 상품은 언제나 삭제 가능하다 — Order/Server 모두 삭제 시점에 productId가 null로 바뀌고
  // (onDelete: SetNull) 그 시점의 이름/월정액이 productNameSnapshot/priceMonthlyKrwSnapshot에
  // 이미 스냅샷으로 남아있어서, 이 상품을 쓰던 서버들은 계속 정상 동작하고 결제내역도 안 깨진다.
  await prisma.product.delete({ where: { id } });
  return NextResponse.json({ ok: true, deleted: true });
});
