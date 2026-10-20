import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { withApiErrorHandling } from "@/lib/apiHandler";
import { notifyServerEvent } from "@/lib/notify";

/** 알림 웹훅이 제대로 연결됐는지 바로 확인할 수 있는 테스트 전송 — 저장은 안 하고 지금
 * 저장돼 있는 deployNotifyWebhookUrl로 샘플 메시지 하나만 보낸다 */
export const POST = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (server.ownerId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "서버 소유자만 보낼 수 있어요." }, { status: 403 });
  }
  if (!server.deployNotifyWebhookUrl) {
    return NextResponse.json({ error: "먼저 웹훅 URL을 저장해주세요." }, { status: 422 });
  }

  await notifyServerEvent(server, `🔔 **${server.name}** 테스트 알림이에요 — 웹훅이 정상적으로 연결됐어요!`);
  return NextResponse.json({ ok: true });
});
