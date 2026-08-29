import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { prisma } from "@/lib/prisma";
import { PteroClient } from "@/lib/pterodactyl";
import { withApiErrorHandling } from "@/lib/apiHandler";

/** 우선순위 순 — 봇 템플릿마다 토큰 변수 이름이 달라서 defaultEnvironment에 실제로 있는 것부터 찾는다 */
const TOKEN_KEY_CANDIDATES = ["BOT_TOKEN", "DISCORD_TOKEN", "discord_token", "TOKEN", "CLIENT_TOKEN", "DISCORD_BOT_TOKEN"];

const PLACEHOLDER_VALUES = new Set([
  "", "GET_YOUR_OWN", "GETABOTTOKEN", "ThisNeedsToBeChanged",
  "get_your_own_token_from_discord_", "get from discord developers",
]);

/**
 * 코딩/서버를 몰라도 봇을 자기 서버에 초대할 수 있도록, 저장된 봇 토큰으로 디스코드에
 * 직접 물어봐서(Bot 토큰으로 애플리케이션 정보 조회) 초대 링크를 자동으로 만들어준다.
 * 사용자가 클라이언트 ID를 따로 찾아 초대 링크를 손으로 조립할 필요가 없다.
 */
export const GET = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const access = await authorizeServerAccess(user, id);
  if (!access || !access.pterodactylIdentifier) {
    return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  }
  if (access.ownerId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "서버 소유자만 확인할 수 있어요." }, { status: 403 });
  }

  const template = await prisma.serverTemplate.findUniqueOrThrow({ where: { id: access.templateId } });
  const defaultEnv = template.defaultEnvironment as Record<string, string>;
  const tokenKey = TOKEN_KEY_CANDIDATES.find((key) => key in defaultEnv);
  if (!tokenKey) {
    return NextResponse.json({ error: "이 서버 종류는 봇 토큰 항목이 없어서 초대 링크를 만들 수 없어요." }, { status: 422 });
  }

  const variables = await PteroClient.getStartupVariables(access.pterodactylIdentifier);
  const tokenValue = variables.find((v) => v.envVariable === tokenKey)?.serverValue ?? "";
  if (PLACEHOLDER_VALUES.has(tokenValue)) {
    return NextResponse.json(
      { error: "먼저 설정 탭의 '시작 변수'에서 봇 토큰을 입력하고 저장해주세요." },
      { status: 422 },
    );
  }

  const discordRes = await fetch("https://discord.com/api/v10/oauth2/applications/@me", {
    headers: { Authorization: `Bot ${tokenValue}` },
  });
  if (!discordRes.ok) {
    return NextResponse.json(
      { error: "디스코드가 이 토큰을 거부했어요. 토큰이 올바른지 다시 확인해주세요." },
      { status: 422 },
    );
  }
  const app = await discordRes.json();
  const clientId: string = app.id;
  const appName: string = app.name;

  return NextResponse.json({
    clientId,
    appName,
    // permissions=8(관리자) — 처음 쓰는 사람이 권한 하나하나 고르지 않아도 바로 되게 하는 기본값
    inviteUrl: `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`,
  });
});
