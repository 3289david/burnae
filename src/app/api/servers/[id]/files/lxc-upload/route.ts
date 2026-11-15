import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess, getServerRole, hasServerRank } from "@/lib/serverAccess";
import { writeVpsFileBinary } from "@/lib/vpsLxc";
import { withApiErrorHandling } from "@/lib/apiHandler";

/** LXC VPS용 업로드 — upload-url이 가리키는 이 앱 자체의 라우트. 프론트는 Pterodactyl 때와
 * 똑같이 multipart/form-data로 "files" 필드에 담아 바로 POST한다(FilesTab.tsx 그대로 재사용). */
export const POST = withApiErrorHandling(async (
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
  if (!hasServerRank(await getServerRole(user, server), "DEVELOPER")) {
    return NextResponse.json({ error: "파일을 수정할 권한이 없어요." }, { status: 403 });
  }

  const dir = new URL(request.url).searchParams.get("dir") ?? "/";
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "업로드할 파일이 없어요." }, { status: 422 });

  for (const file of files) {
    const buf = Buffer.from(await file.arrayBuffer());
    const target = `${dir.replace(/\/$/, "")}/${file.name}`;
    await writeVpsFileBinary(server.lxcContainerName, target, buf);
  }
  return NextResponse.json({ ok: true });
});
