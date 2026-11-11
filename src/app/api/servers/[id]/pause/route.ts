import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { PteroClient } from "@/lib/pterodactyl";
import { withApiErrorHandling } from "@/lib/apiHandler";
import { logServerActivity } from "@/lib/serverActivityLog";

const schema = z.object({ paused: z.boolean() });

/**
 * 서버 일시정지(Render의 Suspend) — 삭제하지 않고 꺼두고, 다시 켤 때 정지했던 시간만큼
 * renewalDueAt(결제 만료일)을 뒤로 밀어서 그 기간만큼은 손해 보지 않게 한다. 관리자가 미납/정책
 * 위반으로 거는 SUSPENDED 상태(suspendedReason)와는 완전히 별개 — 저건 처벌성, 이건 소유자가
 * 직접 고르는 "잠깐 안 쓸게요"다.
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
  if (!server.pterodactylIdentifier) {
    return NextResponse.json({ error: "서버가 아직 준비 중입니다." }, { status: 409 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  if (parsed.data.paused) {
    if (server.pausedAt) return NextResponse.json({ ok: true, pausedAt: server.pausedAt });

    await PteroClient.sendPowerAction(server.pterodactylIdentifier, "stop").catch((err) => {
      console.error(`[pause] 서버 ${id} 정지 실패(DB는 그대로 진행):`, err);
    });
    const updated = await prisma.server.update({ where: { id }, data: { pausedAt: new Date() } });
    await logServerActivity(id, user.id, "SERVER_PAUSED", "소유자가 서버를 일시정지했어요.");
    return NextResponse.json({ ok: true, pausedAt: updated.pausedAt });
  }

  if (!server.pausedAt) return NextResponse.json({ ok: true, pausedAt: null, renewalDueAt: server.renewalDueAt });

  const elapsedMs = Date.now() - server.pausedAt.getTime();
  const nextRenewalDueAt = server.renewalDueAt ? new Date(server.renewalDueAt.getTime() + elapsedMs) : null;

  const updated = await prisma.server.update({
    where: { id },
    data: { pausedAt: null, ...(nextRenewalDueAt ? { renewalDueAt: nextRenewalDueAt } : {}) },
  });
  await PteroClient.sendPowerAction(server.pterodactylIdentifier, "start").catch((err) => {
    console.error(`[pause] 서버 ${id} 재개(시작) 실패:`, err);
  });
  await logServerActivity(id, user.id, "SERVER_RESUMED", "소유자가 서버 일시정지를 해제했어요.");

  return NextResponse.json({ ok: true, pausedAt: null, renewalDueAt: updated.renewalDueAt?.toISOString() ?? null });
});
