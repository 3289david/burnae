import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess, getServerRole, hasServerRank } from "@/lib/serverAccess";
import { prisma } from "@/lib/prisma";
import { withApiErrorHandling } from "@/lib/apiHandler";

/** 최근 배포 기록 — 콘솔/파일 접근과 같은 기준(DEVELOPER 이상) */
export const GET = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (!hasServerRank(await getServerRole(user, server), "DEVELOPER")) {
    return NextResponse.json({ error: "배포 이력을 볼 권한이 없어요." }, { status: 403 });
  }

  const logs = await prisma.deploymentLog.findMany({
    where: { serverId: id },
    orderBy: { startedAt: "desc" },
    take: 20,
  });

  const actorIds = [...new Set(logs.map((l) => l.actorUserId).filter((x): x is string => !!x))];
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const actorName = new Map(actors.map((a) => [a.id, a.name]));

  return NextResponse.json(
    logs.map((l) => ({
      id: l.id,
      trigger: l.trigger,
      actorName: l.actorUserId ? actorName.get(l.actorUserId) ?? null : null,
      success: l.success,
      output: l.output,
      startedAt: l.startedAt,
      durationMs: l.durationMs,
      commitSha: l.commitSha,
    })),
  );
});
