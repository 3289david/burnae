import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { downloadVpsFile } from "@/lib/vpsLxc";
import { withApiErrorHandling } from "@/lib/apiHandler";

/** LXC VPS용 — Pterodactyl처럼 별도 다운로드 서버가 없어서, download-url이 가리키는 이 앱
 * 자체의 라우트에서 바로 바이트를 스트리밍한다(세션 쿠키로 이미 인증된 같은 origin이라
 * 1회용 토큰 발급 없이 여기서 다시 권한만 확인하면 충분하다). */
export const GET = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server || !server.lxcContainerName) {
    return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  }

  const file = new URL(request.url).searchParams.get("file");
  if (!file) return NextResponse.json({ error: "file 파라미터가 필요합니다." }, { status: 422 });

  const bytes = await downloadVpsFile(server.lxcContainerName, file);
  const filename = file.split("/").filter(Boolean).pop() ?? "download";
  return new NextResponse(new Blob([new Uint8Array(bytes)]), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "Content-Length": String(bytes.length),
    },
  });
});
