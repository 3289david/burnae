import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { PteroClient } from "@/lib/pterodactyl";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; backupId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id, backupId } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server || !server.pterodactylIdentifier) {
    return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  }

  await PteroClient.sendPowerAction(server.pterodactylIdentifier, "stop");
  await PteroClient.restoreBackup(server.pterodactylIdentifier, backupId);
  return NextResponse.json({ ok: true });
}
