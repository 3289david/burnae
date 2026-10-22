import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { prisma } from "@/lib/prisma";
import { withApiErrorHandling } from "@/lib/apiHandler";
import { runAiTurn } from "@/lib/ai/engine";
import { notifyServerEvent } from "@/lib/notify";

/** 생성 시점에 GitHub 등에서 저장소를 가져온 서버에 한 번 제공되는 "AI 자동 설치/설정" —
 * 소유자가 직접 동의를 눌러야 실행되고, 비용은 고객 크레딧이 아니라 플랫폼이 부담한다
 * (skipBilling). 메이커 모드와 동일하게 승인 없이 바로 실행(write_file/console 명령 등). */
export const POST = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (server.ownerId !== user.id) {
    return NextResponse.json({ error: "서버 소유자만 사용할 수 있어요." }, { status: 403 });
  }
  if (!server.aiAutoSetupAvailable) {
    return NextResponse.json({ error: "이 서버는 AI 자동 설정을 쓸 수 없어요." }, { status: 409 });
  }

  // 먼저 꺼서 중복 실행/이중 클릭을 막는다 — 실행 자체가 실패해도 다시 못 쓰는 건 감수(재시도는
  // 일반 메이커 대화로 계속할 수 있음)
  await prisma.server.update({ where: { id }, data: { aiAutoSetupAvailable: false } });

  const conversation = await prisma.aiConversation.create({
    data: {
      userId: user.id,
      serverId: server.id,
      kind: "MAKER",
      title: "AI 자동 설정",
    },
  });

  await prisma.aiMessage.create({
    data: {
      conversationId: conversation.id,
      role: "USER",
      content:
        "이 서버는 방금 GitHub 저장소에서 코드를 받아서 만들어졌어요. 파일을 확인해서 필요한 " +
        "패키지를 설치하고, 실행에 필요한 설정이 빠져있으면 채우고, 서버를 실행 가능한 상태로 " +
        "만들어주세요. 끝나면 무엇을 했는지 한국어로 간단히 요약해주세요.",
    },
  });

  try {
    const result = await runAiTurn(conversation.id, server, user.id, { skipBilling: true });
    await notifyServerEvent(
      server,
      `🤖 **${server.name}** AI 자동 설정이 끝났어요.\n${result.assistantText ?? "대시보드 AI 탭에서 결과를 확인해주세요."}`,
    );
    return NextResponse.json({ ok: true, conversationId: conversation.id, result });
  } catch (err) {
    console.error(`[ai-auto-setup] 서버 ${server.id} 자동 설정 실패:`, err);
    await notifyServerEvent(server, `⚠️ **${server.name}** AI 자동 설정 중 문제가 있었어요. 대시보드 AI 탭에서 직접 이어서 할 수 있어요.`);
    return NextResponse.json({ ok: false, conversationId: conversation.id, error: "자동 설정 중 문제가 있었어요." }, { status: 500 });
  }
});
