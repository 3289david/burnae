import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const events = await prisma.event.findMany({
    orderBy: { createdAt: "desc" },
    include: { coupon: true },
  });
  return NextResponse.json(events);
}

const schema = z.object({
  title: z.string().min(1).max(60),
  description: z.string().min(1).max(2000),
  bannerImageUrl: z.string().url().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  couponId: z.string().optional(),
});

/** 관리자가 새 이벤트/프로모션을 생성. 쿠폰을 연결하면 고객 화면에서 자동 적용 가능 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 422 });
  }
  const { startsAt, endsAt, ...rest } = parsed.data;

  const event = await prisma.event.create({
    data: { ...rest, startsAt: new Date(startsAt), endsAt: new Date(endsAt) },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "EVENT_CREATED",
      targetType: "Event",
      targetId: event.id,
      metadata: { title: event.title },
    },
  });

  return NextResponse.json(event);
}
