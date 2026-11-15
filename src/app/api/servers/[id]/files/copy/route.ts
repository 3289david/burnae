import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess, getServerRole, hasServerRank } from "@/lib/serverAccess";
import { PteroClient } from "@/lib/pterodactyl";
import { copyVpsFile } from "@/lib/vpsLxc";
import { withApiErrorHandling } from "@/lib/apiHandler";

const schema = z.object({ location: z.string().min(1) });

export const POST = withApiErrorHandling(async (
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
  if (!hasServerRank(await getServerRole(user, server), "DEVELOPER")) {
    return NextResponse.json({ error: "파일을 수정할 권한이 없어요." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  if (server.lxcContainerName) {
    await copyVpsFile(server.lxcContainerName, parsed.data.location);
  } else {
    await PteroClient.copyFile(server.pterodactylIdentifier!, parsed.data.location);
  }
  return NextResponse.json({ ok: true });
});
