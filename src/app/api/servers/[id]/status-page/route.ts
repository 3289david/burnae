import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { prisma } from "@/lib/prisma";
import { withApiErrorHandling } from "@/lib/apiHandler";
import { generateStatusPageSlug } from "@/lib/statusPage";

const schema = z.object({
  enabled: z.boolean(),
});

export const GET = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });

  return NextResponse.json({ statusPageEnabled: server.statusPageEnabled, statusPageSlug: server.statusPageSlug });
});

/** 공개 상태 페이지 켜기/끄기 — 소유자만. 처음 켤 때 고유 슬러그를 발급한다(한번 발급하면 유지) */
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

  let slug = server.statusPageSlug;
  if (parsed.data.enabled && !slug) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateStatusPageSlug();
      const taken = await prisma.server.findUnique({ where: { statusPageSlug: candidate }, select: { id: true } });
      if (!taken) {
        slug = candidate;
        break;
      }
    }
    if (!slug) return NextResponse.json({ error: "슬러그 발급에 실패했어요. 다시 시도해주세요." }, { status: 500 });
  }

  const updated = await prisma.server.update({
    where: { id },
    data: { statusPageEnabled: parsed.data.enabled, statusPageSlug: slug },
  });
  return NextResponse.json({ statusPageEnabled: updated.statusPageEnabled, statusPageSlug: updated.statusPageSlug });
});
