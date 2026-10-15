import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess, getServerRole, hasServerRank } from "@/lib/serverAccess";
import { PteroClient } from "@/lib/pterodactyl";
import { withApiErrorHandling } from "@/lib/apiHandler";

export const POST = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string; backupId: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id, backupId } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server || !server.pterodactylIdentifier) {
    return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  }
  // 백업 삭제/잠금해제/복원은 되돌릴 수 없거나 현재 데이터를 통째로 덮어쓴다 — 소유자가
  // 신뢰해서 위임한 멤버 ADMIN 등급 이상만 할 수 있게 한다(개발/운영 멤버보다 한 단계 위).
  if (!hasServerRank(await getServerRole(user, server), "ADMIN")) {
    return NextResponse.json({ error: "백업을 관리할 권한이 없어요." }, { status: 403 });
  }

  const backup = await PteroClient.toggleBackupLock(server.pterodactylIdentifier, backupId);
  return NextResponse.json(backup);
});
