import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { postOrRefreshSurvey } from "@/lib/discordBoards";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const responses = await prisma.surveyResponse.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, email: true } } },
    take: 300,
  });
  return NextResponse.json(responses);
}

const pollSchema = z.object({
  question: z.string().min(1).max(200),
  options: z.array(z.string().min(1).max(80)).min(2).max(10),
  channelId: z.string().min(1),
});

/** 관리자가 새 설문(투표)을 만들어 디스코드 채널에 버튼 투표로 올린다 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const parsed = pollSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." }, { status: 422 });
  }

  const survey = await prisma.survey.create({ data: parsed.data });
  await postOrRefreshSurvey(survey.id);

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "SURVEY_CREATED",
      targetType: "Survey",
      targetId: survey.id,
      metadata: parsed.data,
    },
  });

  return NextResponse.json(survey);
}
