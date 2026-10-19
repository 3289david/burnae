import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { prisma } from "@/lib/prisma";
import { withApiErrorHandling } from "@/lib/apiHandler";

const schema = z.object({
  path: z.string().max(200).nullable(),
});

/** 헬스체크 경로 설정 — 소유자만(서버 가동 정책을 바꾸는 설정이라 팀 멤버에게는 안 넘김) */
export const PATCH = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (server.ownerId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "서버 소유자만 바꿀 수 있어요." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  let path = parsed.data.path?.trim() || null;
  if (path && !path.startsWith("/")) path = `/${path}`;

  const updated = await prisma.server.update({
    where: { id },
    data: { healthCheckPath: path, healthCheckFailures: 0 },
  });
  return NextResponse.json({ healthCheckPath: updated.healthCheckPath });
});
