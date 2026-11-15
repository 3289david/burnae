import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { PteroClient } from "@/lib/pterodactyl";
import { withApiErrorHandling } from "@/lib/apiHandler";

export const GET = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server || !(server.pterodactylIdentifier || server.lxcContainerName)) {
    return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  }

  const file = new URL(request.url).searchParams.get("file");
  if (!file) return NextResponse.json({ error: "file 파라미터가 필요합니다." }, { status: 422 });

  // LXC VPS는 Wings 같은 별도 다운로드 서버가 없다 — 우리 앱 자체가 이미 세션 쿠키로 인증된
  // 같은 origin이라, Pterodactyl처럼 1회용 토큰 URL을 따로 발급할 필요 없이 이 앱의
  // lxc-download 라우트를 그냥 바로 가리키면 된다(그 라우트에서 다시 권한을 검사한다).
  const url = server.lxcContainerName
    ? `/api/servers/${id}/files/lxc-download?file=${encodeURIComponent(file)}`
    : await PteroClient.getDownloadUrl(server.pterodactylIdentifier!, file);
  return NextResponse.json({ url });
});
