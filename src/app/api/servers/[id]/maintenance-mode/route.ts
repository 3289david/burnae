import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { withApiErrorHandling } from "@/lib/apiHandler";
import { syncAppProxyMap } from "@/lib/appProxy";

const schema = z.object({ enabled: z.boolean() });

/**
 * 유지보수 모드(Render의 Maintenance Mode) on/off — 켜면 이 서버의 app.krl.kr 주소가 실제
 * 컨테이너 대신 "점검 중" 안내 페이지로 연결된다(syncAppProxyMap, burnae-maintenance-page.conf).
 * HTTP로 접속하는 종류(GENERAL/DISCORD_BOT)에서만 의미 있다 — 마인크래프트는 이 프록시 자체를 안 쓴다.
 */
export const PATCH = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (server.ownerId !== user.id) {
    return NextResponse.json({ error: "서버 소유자만 바꿀 수 있어요." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  await prisma.server.update({ where: { id }, data: { maintenanceModeEnabled: parsed.data.enabled } });

  // 다음 유지보수 크론(최대 10분 뒤)을 안 기다리고 지금 바로 반영한다.
  await syncAppProxyMap(prisma).catch((err) => {
    console.error(`[maintenance-mode] 서버 ${id} 프록시 맵 갱신 실패:`, err);
  });

  return NextResponse.json({ ok: true, enabled: parsed.data.enabled });
});
