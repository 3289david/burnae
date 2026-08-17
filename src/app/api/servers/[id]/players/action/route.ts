import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import * as Players from "@/lib/players";

const schema = z.object({
  type: z.enum([
    "whitelist_add",
    "whitelist_remove",
    "whitelist_toggle",
    "op",
    "deop",
    "ban",
    "pardon",
    "kick",
  ]),
  name: z.string().min(1).max(32).optional(),
  reason: z.string().max(200).optional(),
  enabled: z.boolean().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
  const { type, name, reason, enabled } = parsed.data;
  const identifier = server.pterodactylIdentifier;

  try {
    switch (type) {
      case "whitelist_add":
        if (!name) throw new Error("플레이어 이름이 필요합니다.");
        await Players.whitelistAdd(identifier, name);
        break;
      case "whitelist_remove":
        if (!name) throw new Error("플레이어 이름이 필요합니다.");
        await Players.whitelistRemove(identifier, name);
        break;
      case "whitelist_toggle":
        await Players.whitelistToggle(identifier, !!enabled);
        await prisma.server.update({ where: { id }, data: { whitelistEnabled: !!enabled } });
        break;
      case "op":
        if (!name) throw new Error("플레이어 이름이 필요합니다.");
        await Players.opPlayer(identifier, name);
        break;
      case "deop":
        if (!name) throw new Error("플레이어 이름이 필요합니다.");
        await Players.deopPlayer(identifier, name);
        break;
      case "ban":
        if (!name) throw new Error("플레이어 이름이 필요합니다.");
        await Players.banPlayer(identifier, name, reason);
        break;
      case "pardon":
        if (!name) throw new Error("플레이어 이름이 필요합니다.");
        await Players.pardonPlayer(identifier, name);
        break;
      case "kick":
        if (!name) throw new Error("플레이어 이름이 필요합니다.");
        await Players.kickPlayer(identifier, name, reason);
        break;
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
