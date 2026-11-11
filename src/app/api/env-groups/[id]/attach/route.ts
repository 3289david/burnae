import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { withApiErrorHandling } from "@/lib/apiHandler";
import { applyEnvGroupToServer } from "@/lib/envGroup";

const schema = z.object({ serverId: z.string().min(1) });

/** 서버를 이 그룹에 연결하고, 그룹의 현재 변수값을 바로 그 서버에 밀어넣는다 */
export const POST = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const group = await prisma.envGroup.findUnique({ where: { id } });
  if (!group || group.ownerId !== user.id) return NextResponse.json({ error: "그룹을 찾을 수 없습니다." }, { status: 404 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  const server = await prisma.server.findUnique({ where: { id: parsed.data.serverId } });
  if (!server || server.ownerId !== user.id) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });

  await prisma.server.update({ where: { id: server.id }, data: { envGroupId: group.id } });
  const result = await applyEnvGroupToServer(group.variables as Record<string, string>, server);

  return NextResponse.json({ ok: true, applied: result.ok, failedKeys: result.failedKeys });
});
