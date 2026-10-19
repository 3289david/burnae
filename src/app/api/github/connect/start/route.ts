import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { buildGithubConnectAuthorizeUrl, buildGithubConnectState } from "@/lib/githubConnect";

export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const serverId = new URL(request.url).searchParams.get("serverId");
  if (!serverId) return NextResponse.json({ error: "serverId가 필요합니다." }, { status: 400 });

  const server = await authorizeServerAccess(user, serverId);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (server.ownerId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "서버 소유자만 GitHub를 연동할 수 있어요." }, { status: 403 });
  }

  const csrf = crypto.randomUUID();
  const state = buildGithubConnectState(csrf, serverId);

  const store = await cookies();
  // 로그인 콜백이 읽는 쿠키 이름(oauth_state_github)을 그대로 재사용한다 — 같은 고정 Authorization
  // callback URL을 쓰는 한 흐름이라 콜백 라우트에서 하나의 검증 로직으로 처리된다
  store.set("oauth_state_github", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(buildGithubConnectAuthorizeUrl(state));
}
