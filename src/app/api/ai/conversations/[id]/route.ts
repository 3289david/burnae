import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { isAiModelKey } from "@/lib/ai/models";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const conversation = await prisma.aiConversation.findFirst({
    where: { id, userId: user.id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      tasks: { orderBy: { order: "asc" } },
    },
  });
  if (!conversation) return NextResponse.json({ error: "대화를 찾을 수 없습니다." }, { status: 404 });

  // 도구 결과 원본(JSON blocks)은 프론트에 노출하지 않는다 — TOOL 메시지는 content(사람이 읽을
  // 한 줄 요약, 예: "파일 작성: index.html")만 내려서 빌드 진행 로그처럼 보여준다
  const messages = conversation.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt }));

  const pendingActivity = await prisma.aiActivityLog.findFirst({
    where: { conversationId: id, status: "PENDING_APPROVAL" },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ ...conversation, messages, pendingActivity });
}

const patchSchema = z.object({ model: z.string().refine(isAiModelKey) });

/** 대화를 이어가면서 모델만 바꾸고 싶을 때(예: Opus로 시작했다가 Haiku로 전환) */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const conversation = await prisma.aiConversation.findFirst({ where: { id, userId: user.id } });
  if (!conversation) return NextResponse.json({ error: "대화를 찾을 수 없습니다." }, { status: 404 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  const updated = await prisma.aiConversation.update({ where: { id }, data: { model: parsed.data.model } });
  return NextResponse.json({ model: updated.model });
}
