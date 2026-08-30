import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

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
