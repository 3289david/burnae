import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { withApiErrorHandling } from "@/lib/apiHandler";

const MAX_GROUPS_PER_USER = 20;
const MAX_VARS_PER_GROUP = 50;

const variablesSchema = z.record(z.string().min(1).max(100), z.string().max(2000));

/** 내 환경변수 그룹 목록 — 각 그룹에 몇 개 서버가 연결돼 있는지도 같이 준다 */
export const GET = withApiErrorHandling(async () => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const groups = await prisma.envGroup.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    include: { servers: { select: { id: true, name: true } } },
  });

  return NextResponse.json(
    groups.map((g) => ({
      id: g.id,
      name: g.name,
      variables: g.variables as Record<string, string>,
      servers: g.servers,
    })),
  );
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  variables: variablesSchema.optional(),
});

export const POST = withApiErrorHandling(async (request: Request) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  const count = await prisma.envGroup.count({ where: { ownerId: user.id } });
  if (count >= MAX_GROUPS_PER_USER) {
    return NextResponse.json({ error: `환경변수 그룹은 최대 ${MAX_GROUPS_PER_USER}개까지 만들 수 있어요.` }, { status: 422 });
  }
  if (Object.keys(parsed.data.variables ?? {}).length > MAX_VARS_PER_GROUP) {
    return NextResponse.json({ error: `그룹당 변수는 최대 ${MAX_VARS_PER_GROUP}개까지예요.` }, { status: 422 });
  }

  const group = await prisma.envGroup.create({
    data: { ownerId: user.id, name: parsed.data.name, variables: parsed.data.variables ?? {} },
  });

  return NextResponse.json({ id: group.id, name: group.name, variables: group.variables, servers: [] }, { status: 201 });
});
