import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { withApiErrorHandling } from "@/lib/apiHandler";
import { applyEnvGroupToServer } from "@/lib/envGroup";

const MAX_VARS_PER_GROUP = 50;
const variablesSchema = z.record(z.string().min(1).max(100), z.string().max(2000));

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  variables: variablesSchema.optional(),
  reapply: z.boolean().optional(),
});

/** 그룹 이름/변수 수정 — reapply:true면 바뀐 값을 연결된 서버 전부에 바로 다시 밀어넣는다 */
export const PATCH = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const group = await prisma.envGroup.findUnique({ where: { id }, include: { servers: true } });
  if (!group || group.ownerId !== user.id) return NextResponse.json({ error: "그룹을 찾을 수 없습니다." }, { status: 404 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  if (parsed.data.variables && Object.keys(parsed.data.variables).length > MAX_VARS_PER_GROUP) {
    return NextResponse.json({ error: `그룹당 변수는 최대 ${MAX_VARS_PER_GROUP}개까지예요.` }, { status: 422 });
  }

  const updated = await prisma.envGroup.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.variables !== undefined ? { variables: parsed.data.variables } : {}),
    },
  });

  const failures: { serverId: string; serverName: string; failedKeys: string[] }[] = [];
  if (parsed.data.reapply) {
    for (const server of group.servers) {
      const result = await applyEnvGroupToServer(updated.variables as Record<string, string>, server);
      if (!result.ok) failures.push({ serverId: server.id, serverName: server.name, failedKeys: result.failedKeys });
    }
  }

  return NextResponse.json({ id: updated.id, name: updated.name, variables: updated.variables, failures });
});

export const DELETE = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const group = await prisma.envGroup.findUnique({ where: { id } });
  if (!group || group.ownerId !== user.id) return NextResponse.json({ error: "그룹을 찾을 수 없습니다." }, { status: 404 });

  // 연결된 서버들의 envGroupId는 스키마의 onDelete: SetNull로 자동 정리된다(실제 컨테이너에
  // 이미 적용된 변수값 자체는 그대로 남아있고, "그룹 연결"만 끊어진다).
  await prisma.envGroup.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
