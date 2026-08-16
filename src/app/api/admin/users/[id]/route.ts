import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const schema = z.object({
  storageQuotaGbOverride: z.number().int().min(1).nullable().optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  aiCreditsRemaining: z.number().int().min(0).optional(),
});

/** 관리자가 특정 유저의 저장공간 한도(기본 10GB)를 상향하거나 계정을 정지 */
export async function PATCH(
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

  const user = await prisma.user.update({ where: { id }, data: parsed.data });

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "USER_UPDATED",
      targetType: "User",
      targetId: id,
      metadata: parsed.data,
    },
  });

  return NextResponse.json({ id: user.id, email: user.email, status: user.status });
}
