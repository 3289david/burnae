import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { PteroClient } from "@/lib/pterodactyl";
import { withApiErrorHandling } from "@/lib/apiHandler";

/** 실시간 콘솔 스트리밍용 웹소켓 인증 정보 발급 (프론트에서 직접 wss 연결) */
export const GET = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server || !server.pterodactylIdentifier) {
    return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  }

  const credentials = await PteroClient.getWebsocketCredentials(server.pterodactylIdentifier);
  return NextResponse.json(credentials);
});
