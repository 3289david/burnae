import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess, getServerRole, hasServerRank } from "@/lib/serverAccess";
import { prisma } from "@/lib/prisma";
import { withApiErrorHandling } from "@/lib/apiHandler";

async function loadOwnedTask(serverId: string, taskId: string) {
  const task = await prisma.scheduledTask.findUnique({ where: { id: taskId } });
  if (!task || task.serverId !== serverId) return null;
  return task;
}

const patchSchema = z.object({ enabled: z.boolean().optional(), name: z.string().min(1).max(60).optional() });

export const PATCH = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id, taskId } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (!hasServerRank(await getServerRole(user, server), "DEVELOPER")) {
    return NextResponse.json({ error: "예약 작업을 바꿀 권한이 없어요." }, { status: 403 });
  }
  const task = await loadOwnedTask(id, taskId);
  if (!task) return NextResponse.json({ error: "예약 작업을 찾을 수 없습니다." }, { status: 404 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  const updated = await prisma.scheduledTask.update({ where: { id: taskId }, data: parsed.data });
  return NextResponse.json(updated);
});

export const DELETE = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id, taskId } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (!hasServerRank(await getServerRole(user, server), "DEVELOPER")) {
    return NextResponse.json({ error: "예약 작업을 지울 권한이 없어요." }, { status: 403 });
  }
  const task = await loadOwnedTask(id, taskId);
  if (!task) return NextResponse.json({ error: "예약 작업을 찾을 수 없습니다." }, { status: 404 });

  await prisma.scheduledTask.delete({ where: { id: taskId } });
  return NextResponse.json({ ok: true });
});
