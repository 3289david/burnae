import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess, getServerRole, hasServerRank } from "@/lib/serverAccess";
import { prisma } from "@/lib/prisma";
import { withApiErrorHandling } from "@/lib/apiHandler";
import { PteroClient } from "@/lib/pterodactyl";
import { logServerActivity } from "@/lib/serverActivityLog";

/** 10분 간격 크론 대기 없이 지금 바로 1회 실행 — Railway/Render의 cron job "Trigger run" 버튼과 같은 역할 */
export const POST = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id, taskId } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (!hasServerRank(await getServerRole(user, server), "DEVELOPER")) {
    return NextResponse.json({ error: "예약 작업을 실행할 권한이 없어요." }, { status: 403 });
  }
  if (server.status !== "RUNNING" || !server.pterodactylIdentifier) {
    return NextResponse.json({ error: "서버가 켜져 있어야 실행할 수 있어요." }, { status: 422 });
  }

  const task = await prisma.scheduledTask.findUnique({ where: { id: taskId } });
  if (!task || task.serverId !== id) return NextResponse.json({ error: "예약 작업을 찾을 수 없습니다." }, { status: 404 });

  await PteroClient.sendConsoleCommand(server.pterodactylIdentifier, task.command);
  await prisma.scheduledTask.update({ where: { id: taskId }, data: { lastRunAt: new Date() } });
  await logServerActivity(id, user.id, "SCHEDULED_TASK_RUN", `${task.name} (수동 실행): ${task.command}`);

  return NextResponse.json({ ok: true });
});
