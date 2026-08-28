import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const items = await prisma.shopItem.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json(items);
}

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  kind: z.enum([
    "AI_CREDITS",
    "DISCOUNT_COUPON",
    "CUSTOM",
    "RAM_UPGRADE",
    "CPU_UPGRADE",
    "DISK_UPGRADE",
    "BACKUP_SLOT_UPGRADE",
  ]),
  pointsCost: z.number().int().min(1),
  amount: z.number().int().min(1).optional(),
  maxTotal: z.number().int().min(1).optional(),
  sortOrder: z.number().int().default(0),
});

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." }, { status: 422 });
  }

  const item = await prisma.shopItem.create({ data: parsed.data });
  return NextResponse.json(item);
}
