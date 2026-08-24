import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const schema = z.object({
  points: z.number().int().refine((v) => v !== 0, "0은 지급할 수 없어요."),
  reason: z.string().max(200).optional(),
});

/** 관리자가 임의로 홍보 포인트를 지급(또는 차감)한다 — 이벤트 경품, 문의 보상, 오지급 정정 등 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." }, { status: 422 });
  }
  const { points, reason } = parsed.data;

  const user = await prisma.user.update({
    where: { id },
    data: { promotionPoints: { increment: points } },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "ADMIN_POINTS_GRANTED",
      targetType: "User",
      targetId: id,
      metadata: { points, reason },
    },
  });

  return NextResponse.json({ id: user.id, promotionPoints: user.promotionPoints });
}
