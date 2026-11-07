import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { PteroClient } from "@/lib/pterodactyl";
import { withApiErrorHandling } from "@/lib/apiHandler";
import { prisma } from "@/lib/prisma";

export const GET = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server || !server.pterodactylIdentifier) {
    return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  }

  const variables = await PteroClient.getStartupVariables(server.pterodactylIdentifier);
  return NextResponse.json(variables);
});

const schema = z.object({ key: z.string().min(1), value: z.string() });

export const PUT = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server || !server.pterodactylIdentifier) {
    return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  }
  if (server.ownerId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "서버 소유자만 변경할 수 있어요." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  await PteroClient.updateStartupVariable(server.pterodactylIdentifier, parsed.data.key, parsed.data.value).catch((err) => {
    // GIT_ADDRESS는 egg가 변수로 등록 안 해둔 템플릿이 더 많아서(deploy.ts 참고) 여기서 실패하는 게
    // 오히려 정상인 경우가 많다 — 아래 DB 반영은 그와 무관하게 항상 해야 하니 에러를 삼키고 계속한다
    if (parsed.data.key !== "GIT_ADDRESS") throw err;
  });
  if (parsed.data.key === "GIT_ADDRESS") {
    await prisma.server.update({ where: { id: server.id }, data: { gitAddress: parsed.data.value || null } });
  }
  return NextResponse.json({ ok: true });
});
