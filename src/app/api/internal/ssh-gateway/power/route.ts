import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { PteroClient } from "@/lib/pterodactyl";
import { hasValidInternalSecret } from "@/lib/internalAuth";

const schema = z.object({
  userId: z.string(),
  serverId: z.string(),
  signal: z.enum(["start", "stop", "restart"]),
});

/** ssh burnae.kr 게이트웨이 데몬이 메뉴에서 시작/정지를 눌렀을 때 부른다 — userId가 실제로
 * 그 서버의 소유자인지 여기서 다시 확인한다(게이트웨이 쪽 상태만 믿지 않음). */
export async function POST(request: Request) {
  if (!hasValidInternalSecret(request)) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  const server = await prisma.server.findFirst({
    where: { id: parsed.data.serverId, ownerId: parsed.data.userId, deletedAt: null },
    select: { pterodactylIdentifier: true },
  });
  if (!server || !server.pterodactylIdentifier) {
    return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  }

  await PteroClient.sendPowerAction(server.pterodactylIdentifier, parsed.data.signal);
  return NextResponse.json({ ok: true });
}
