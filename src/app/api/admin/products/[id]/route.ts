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
  // 이 상품을 쓰는 서버가 실제로 있으면(생성 중/삭제된 것 포함) 삭제할 수 없다 — Server.productId는
  // 필수 필드라 그 서버들의 스펙/과금 기준을 잃게 된다. 과거 주문 기록만 있는 경우는 상관없이 삭제
  // 가능하며, 그 주문들의 productId는 자동으로 null이 되고 productNameSnapshot에 이름이 남는다.
  const serverCount = await prisma.server.count({ where: { productId: id } });
  if (serverCount > 0) {
    return NextResponse.json(
      { error: `이 상품으로 만들어진 서버가 ${serverCount}개 있어 삭제할 수 없어요. 먼저 목록에서 숨기려면 "비활성화"를 사용하세요.` },
      { status: 409 },
    );
  }

  await prisma.product.delete({ where: { id } });
  return NextResponse.json({ ok: true, deleted: true });
});
