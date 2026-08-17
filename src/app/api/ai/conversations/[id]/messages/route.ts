import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { runAiTurn } from "@/lib/ai/engine";

const schema = z.object({ message: z.string().min(1).max(2000) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

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

  // 메시지 1건당 크레딧 1개 소모. 상품 구매/갱신 시 aiCreditsPerMonth만큼 충전됨.
  const decremented = await prisma.user.updateMany({
    where: { id: user.id, aiCreditsRemaining: { gt: 0 } },
    data: { aiCreditsRemaining: { decrement: 1 } },
  });
  if (decremented.count === 0) {
    return NextResponse.json(
      { error: "이번 달 AI 사용 크레딧을 모두 썼어요. 다음 결제 갱신 때 다시 충전돼요." },
      { status: 402 },
    );
  }

  await prisma.aiMessage.create({
    data: { conversationId: id, role: "USER", content: parsed.data.message },
  });
  await prisma.aiConversation.update({ where: { id }, data: { updatedAt: new Date() } });

  try {
    const result = await runAiTurn(id, conversation.server, user.id);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[ai chat] 처리 실패:", err);
    return NextResponse.json(
      { error: "AI 응답 처리 중 오류가 발생했습니다." },
      { status: 502 },
    );
  }
}
