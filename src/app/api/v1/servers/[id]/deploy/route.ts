import { NextResponse } from "next/server";
import { authorizeServerAccess, getServerRole, hasServerRank } from "@/lib/serverAccess";
import { requireApiUser } from "@/lib/apiAuth";
import { redeployFromGit } from "@/lib/deploy";
import { withApiErrorHandling } from "@/lib/apiHandler";

export const POST = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "유효하지 않은 토큰이에요." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (!hasServerRank(await getServerRole(user, server), "DEVELOPER")) {
    return NextResponse.json({ error: "배포할 권한이 없어요." }, { status: 403 });
  }

  const result = await redeployFromGit(server, user.id, "MANUAL");
  return NextResponse.json(result);
});
