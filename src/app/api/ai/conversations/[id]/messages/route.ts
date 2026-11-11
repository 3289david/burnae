import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { runAiTurn, InsufficientCreditsError } from "@/lib/ai/engine";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";

const schema = z.object({
  message: z.string().min(1).max(2000),
  // 연결이 끊겨서 AiTab.tsx가 같은 메시지를 자동으로 다시 보낼 때, 재시도마다 같은 값을 보낸다
  clientMessageId: z.string().min(1).max(64).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const rl = checkRateLimit(`ai-message:${user.id}`, 20, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  const { id } = await params;
  const conversation = await prisma.aiConversation.findFirst({
    where: { id, userId: user.id },
    include: { server: true },
  });
  if (!conversation || !conversation.server) {
    return NextResponse.json({ error: "대화를 찾을 수 없습니다." }, { status: 404 });
  }

  const pending = await prisma.aiActivityLog.findFirst({
    where: { conversationId: id, status: "PENDING_APPROVAL" },
  });
  if (pending) {
    return NextResponse.json(
      { error: "이전 작업 승인이 아직 남아있습니다. 먼저 처리해주세요." },
      { status: 409 },
    );
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "메시지를 입력해주세요." }, { status: 422 });

  // 연결이 끊겨서 클라이언트가 같은 요청을 자동으로 재시도한 경우 — 이미 받은 메시지면 새
  // 유저 메시지를 또 만들거나 턴을 다시 돌리지 않는다(파일 중복 작성/명령 중복 실행 방지).
  // 먼저 보낸 요청이 아직 처리 중이거나 이미 끝났을 수 있는데, 어느 쪽이든 클라이언트가 곧이어
  // 부르는 refresh(대화 다시 불러오기)가 실제 결과를 그대로 보여준다.
  if (parsed.data.clientMessageId) {
    const existing = await prisma.aiMessage.findUnique({ where: { clientMessageId: parsed.data.clientMessageId } });
    if (existing) return NextResponse.json({ ok: true, duplicate: true });
  }

  await prisma.aiMessage.create({
    data: { conversationId: id, role: "USER", content: parsed.data.message, clientMessageId: parsed.data.clientMessageId },
  });
  await prisma.aiConversation.update({ where: { id }, data: { updatedAt: new Date() } });

  try {
    // 실제 사용한 토큰량에 따라 턴이 끝난 뒤 크레딧이 과금된다 (runAiTurn 내부, src/lib/ai/pricing.ts).
    const result = await runAiTurn(id, conversation.server, user.id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json({ error: err.message }, { status: 402 });
    }
    console.error("[ai chat] 처리 실패:", err);
    return NextResponse.json(
      { error: "AI 응답 처리 중 오류가 발생했습니다." },
      { status: 502 },
    );
  }
}
