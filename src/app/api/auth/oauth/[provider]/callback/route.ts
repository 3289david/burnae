import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSessionCookie, resolveInitialRole, isAdminEmail } from "@/lib/auth";
import { completeOAuthLogin, type OAuthProviderKey } from "@/lib/oauth";

const VALID_PROVIDERS: OAuthProviderKey[] = ["google", "github", "discord"];
const PROVIDER_ENUM: Record<OAuthProviderKey, "GOOGLE" | "GITHUB" | "DISCORD"> = {
  google: "GOOGLE",
  github: "GITHUB",
  discord: "DISCORD",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerParam } = await params;
  const url = new URL(request.url);
  const loginError = (message: string) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, request.url));

  if (!VALID_PROVIDERS.includes(providerParam as OAuthProviderKey)) {
    return loginError("지원하지 않는 로그인 방식입니다.");
  }
  const provider = providerParam as OAuthProviderKey;

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();
  const expectedState = store.get(`oauth_state_${provider}`)?.value;
  store.delete(`oauth_state_${provider}`);

  if (!code || !state || !expectedState || state !== expectedState) {
    return loginError("로그인 요청이 만료되었거나 올바르지 않습니다. 다시 시도해주세요.");
  }

  let profile;
  try {
    profile = await completeOAuthLogin(provider, code);
  } catch (err) {
    console.error(`[oauth:${provider}] 로그인 실패:`, err);
    return loginError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
  }

  const providerEnum = PROVIDER_ENUM[provider];

  // 1) 이미 이 소셜 계정으로 연결된 유저가 있으면 그대로 로그인
  let user = await prisma.oAuthAccount
    .findUnique({
      where: { provider_providerAccountId: { provider: providerEnum, providerAccountId: profile.providerAccountId } },
      include: { user: true },
    })
    .then((a) => a?.user ?? null);

  // 2) 없으면 이메일이 같은 기존 계정에 연결 (이미 다른 방법으로 가입한 사람)
  if (!user) {
    const existing = await prisma.user.findUnique({ where: { email: profile.email } });
    if (existing) {
      await prisma.oAuthAccount.create({
        data: { userId: existing.id, provider: providerEnum, providerAccountId: profile.providerAccountId },
      });
      user = existing;
    }
  }

  // 3) 그래도 없으면 신규 가입
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: profile.email,
        name: profile.name.slice(0, 20),
        role: resolveInitialRole(profile.email),
        passwordHash: null,
        oauthAccounts: {
          create: { provider: providerEnum, providerAccountId: profile.providerAccountId },
        },
      },
    });
  }

  if (user.status !== "ACTIVE") {
    return loginError("정지된 계정입니다. 고객센터에 문의해주세요.");
  }

  // 디스코드로 로그인했다면 봇 연동(/link)도 자동으로 처리해준다
  if (provider === "discord") {
    await prisma.discordLink
      .upsert({
        where: { userId: user.id },
        update: { discordUserId: profile.providerAccountId },
        create: { userId: user.id, discordUserId: profile.providerAccountId },
      })
      .catch(() => {
        // 이 디스코드 계정이 이미 다른 Burnae 유저에 연결돼 있으면 무시 (로그인 자체는 계속 진행)
      });
  }

  await createSessionCookie({ sub: user.id, role: user.role, email: user.email });

  const redirectTo = isAdminEmail(user.email) ? "/admin" : "/dashboard";
  return NextResponse.redirect(new URL(redirectTo, request.url));
}
