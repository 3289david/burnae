import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { getOnlinePlayers, getWhitelist, getOps, getBans } from "@/lib/players";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (!server.pterodactylIdentifier) {
    return NextResponse.json({ online: [], whitelist: [], ops: [], bans: [], whitelistEnabled: server.whitelistEnabled });
  }

  const [online, whitelist, ops, bans] = await Promise.all([
    getOnlinePlayers(server.pterodactylIdentifier).catch(() => []),
    getWhitelist(server.pterodactylIdentifier),
    getOps(server.pterodactylIdentifier),
    getBans(server.pterodactylIdentifier),
  ]);

  return NextResponse.json({ online, whitelist, ops, bans, whitelistEnabled: server.whitelistEnabled });
}
