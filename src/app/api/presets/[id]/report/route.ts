import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { revokeCustomPresetPoints } from "@/lib/promotions";

/// 서로 다른 유저 이 숫자만큼 신고하면 자동으로 목록에서 내려가고 지급된 포인트도 회수된다.
const REPORT_DELIST_THRESHOLD = 3;

const reportSchema = z.object({ reason: z.string().trim().max(200).optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const preset = await prisma.userPreset.findUnique({ where: { id } });
  if (!preset || preset.delisted) {
    return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
  }
  if (preset.createdById === user.id) {
    return NextResponse.json({ error: "본인 프리셋은 신고할 수 없어요." }, { status: 422 });
  }

  const parsed = reportSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 422 });
  }

  const existing = await prisma.userPresetReport.findUnique({
    where: { presetId_reporterId: { presetId: id, reporterId: user.id } },
  });
  if (existing) {
    return NextResponse.json({ error: "이미 신고했어요." }, { status: 409 });
  }

  await prisma.userPresetReport.create({
    data: { presetId: id, reporterId: user.id, reason: parsed.data.reason || null },
  });
  const updated = await prisma.userPreset.update({
    where: { id },
    data: { reportCount: { increment: 1 } },
  });

  if (updated.reportCount >= REPORT_DELIST_THRESHOLD && !updated.delisted) {
    await prisma.userPreset.update({ where: { id }, data: { delisted: true } });
    await revokeCustomPresetPoints(id, updated.createdById);
  }

  return NextResponse.json({ ok: true });
}
