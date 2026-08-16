import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(coupons);
}

const schema = z.object({
  code: z.string().min(3).max(20).toUpperCase(),
  discountType: z.enum(["PERCENT", "FIXED_KRW"]),
  discountValue: z.number().int().min(1),
  maxUses: z.number().int().min(1).nullable().optional(),
  minOrderKrw: z.number().int().min(0).default(0),
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 422 });
  }
  const { startsAt, expiresAt, ...rest } = parsed.data;

  const coupon = await prisma.coupon.create({
    data: {
      ...rest,
      startsAt: startsAt ? new Date(startsAt) : undefined,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    },
  });
  return NextResponse.json(coupon);
}
