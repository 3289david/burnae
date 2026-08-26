import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const products = await prisma.product.findMany({
    orderBy: { sortOrder: "asc" },
    include: { allowedTemplates: true },
  });
  return NextResponse.json(products);
}

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  ramMb: z.number().int().min(512),
  cpuPercent: z.number().int().min(25),
  diskMb: z.number().int().min(256),
  backupSlots: z.number().int().min(0).default(3),
  aiCreditsPerMonth: z.number().int().min(0).default(0),
  priceMonthlyKrw: z.number().int().min(0),
  allowedTemplateIds: z.array(z.string()).min(1),
  sortOrder: z.number().int().default(0),
  pointsRedeemable: z.boolean().default(false),
  pointsCost: z.number().int().min(0).optional(),
  preorderPriceKrw: z.number().int().min(0).optional(),
});

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 422 });
  }
  const { allowedTemplateIds, ...data } = parsed.data;

  const product = await prisma.product.create({
    data: {
      ...data,
      allowedTemplates: { connect: allowedTemplateIds.map((id) => ({ id })) },
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "PRODUCT_CREATED",
      targetType: "Product",
      targetId: product.id,
      metadata: { name: product.name },
    },
  });

  return NextResponse.json(product);
}
