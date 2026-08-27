import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildAuthorizeUrl, siteUrl, type OAuthProviderKey } from "@/lib/oauth";

const VALID_PROVIDERS: OAuthProviderKey[] = ["google", "github", "discord"];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (!VALID_PROVIDERS.includes(provider as OAuthProviderKey)) {
    return NextResponse.json({ error: "지원하지 않는 로그인 방식입니다." }, { status: 404 });
  }

  const state = crypto.randomUUID();
  const store = await cookies();
  store.set(`oauth_state_${provider}`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  // 로그인 상태에서 "계정 연동"으로 들어온 경우 — 콜백에서 새 로그인/가입 대신 현재 계정에 연동만 한다
  const mode = new URL(request.url).searchParams.get("mode");
  if (mode === "link") {
    store.set(`oauth_link_${provider}`, "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
  }

  // 추천 링크(?ref=코드)로 들어왔으면 콜백에서 신규 가입 시 사용할 수 있게 잠깐 저장해둔다
  const ref = new URL(request.url).searchParams.get("ref");
  if (ref) {
    store.set("referral_code", ref.slice(0, 40), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
  }

  try {
    const url = buildAuthorizeUrl(provider as OAuthProviderKey, state);
    return NextResponse.redirect(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "설정 오류";
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(message)}`, siteUrl()),
    );
  }
}
