import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess, getServerRole, hasServerRank } from "@/lib/serverAccess";
import { prisma } from "@/lib/prisma";
import { withApiErrorHandling } from "@/lib/apiHandler";
import { rollbackToCommit } from "@/lib/deploy";

/** 배포 이력의 특정 시점으로 되돌린다 — 콘솔 명령 실행과 같은 기준(DEVELOPER 이상) */
export const POST = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string; logId: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id, logId } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (!hasServerRank(await getServerRole(user, server), "DEVELOPER")) {
    return NextResponse.json({ error: "롤백할 권한이 없어요." }, { status: 403 });
  }

  const log = await prisma.deploymentLog.findUnique({ where: { id: logId } });
  if (!log || log.serverId !== id || !log.commitSha) {
    return NextResponse.json({ error: "되돌릴 수 있는 기록이 아니에요." }, { status: 409 });
  }

  const result = await rollbackToCommit(server, log.commitSha, user.id);
  return NextResponse.json(result);
});
