import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { PteroClient } from "@/lib/pterodactyl";
import { withApiErrorHandling } from "@/lib/apiHandler";

const schema = z.object({ signal: z.enum(["start", "stop", "restart", "kill"]) });

export const POST = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (!server.pterodactylIdentifier) {
    return NextResponse.json({ error: "서버가 아직 준비 중입니다." }, { status: 409 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });
  }

  await PteroClient.sendPowerAction(server.pterodactylIdentifier, parsed.data.signal);
  return NextResponse.json({ ok: true });
});
