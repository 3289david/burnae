import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess, getServerRole, hasServerRank } from "@/lib/serverAccess";
import { prisma } from "@/lib/prisma";
import { withApiErrorHandling } from "@/lib/apiHandler";

/** 10분마다 도는 운영 크론이 확인하니, 이보다 짧은 간격은 의미가 없어서 최소 10분으로 막는다 */
const MIN_INTERVAL_MINUTES = 10;

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
    return NextResponse.json({ error: "예약 작업을 볼 권한이 없어요." }, { status: 403 });
  }

  const tasks = await prisma.scheduledTask.findMany({ where: { serverId: id }, orderBy: { createdAt: "asc" } });
  return NextResponse.json(tasks);
});

const schema = z.object({
  name: z.string().min(1).max(60),
  command: z.string().min(1).max(500),
  intervalMinutes: z.number().int().min(MIN_INTERVAL_MINUTES).max(60 * 24 * 7),
});

export const POST = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (!hasServerRank(await getServerRole(user, server), "DEVELOPER")) {
    return NextResponse.json({ error: "예약 작업을 만들 권한이 없어요." }, { status: 403 });
  }

  const existing = await prisma.scheduledTask.count({ where: { serverId: id } });
  if (existing >= 10) {
    return NextResponse.json({ error: "서버 하나당 예약 작업은 최대 10개까지 만들 수 있어요." }, { status: 422 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? `간격은 최소 ${MIN_INTERVAL_MINUTES}분이에요.` },
      { status: 422 },
    );
  }

  const task = await prisma.scheduledTask.create({ data: { serverId: id, ...parsed.data } });
  return NextResponse.json(task, { status: 201 });
});
