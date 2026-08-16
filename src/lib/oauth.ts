/**
 * Google / GitHub / Discord OAuth2 Authorization Code Flow를 직접 구현한다.
 * (NextAuth 같은 라이브러리 없이 — 이 프로젝트의 커스텀 세션 시스템과 그대로 통합하기 위함)
 */

export type OAuthProviderKey = "google" | "github" | "discord";

export interface OAuthProfile {
  providerAccountId: string;
  email: string;
  name: string;
}

interface ProviderConfig {
  authUrl: string;
  tokenUrl: string;
  scope: string;
  clientId: string | undefined;
  clientSecret: string | undefined;
}

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

function getConfig(provider: OAuthProviderKey): ProviderConfig {
  switch (provider) {
    case "google":
      return {
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scope: "openid email profile",
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      };
    case "github":
      return {
        authUrl: "https://github.com/login/oauth/authorize",
        tokenUrl: "https://github.com/login/oauth/access_token",
        scope: "read:user user:email",
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      };
    case "discord":
      // 디스코드 봇과 같은 Application을 재사용한다 (DISCORD_CLIENT_ID)
      return {
        authUrl: "https://discord.com/api/oauth2/authorize",
        tokenUrl: "https://discord.com/api/oauth2/token",
        scope: "identify email",
        clientId: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
      };
  }
}

export function getRedirectUri(provider: OAuthProviderKey): string {
  return `${siteUrl()}/api/auth/oauth/${provider}/callback`;
}

export function buildAuthorizeUrl(provider: OAuthProviderKey, state: string): string {
  const config = getConfig(provider);
  if (!config.clientId) {
    throw new Error(`${provider} OAuth Client ID가 설정되지 않았습니다.`);
  }
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: getRedirectUri(provider),
    response_type: "code",
    scope: config.scope,
    state,
  });
  return `${config.authUrl}?${params.toString()}`;
}

async function exchangeCodeForToken(provider: OAuthProviderKey, code: string): Promise<string> {
  const config = getConfig(provider);
  if (!config.clientId || !config.clientSecret) {
    throw new Error(`${provider} OAuth 설정이 완료되지 않았습니다.`);
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: getRedirectUri(provider),
    grant_type: "authorization_code",
  });

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`${provider} 토큰 교환 실패: ${JSON.stringify(data)}`);
  }
  return data.access_token as string;
}

async function fetchProfile(provider: OAuthProviderKey, accessToken: string): Promise<OAuthProfile> {
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  if (provider === "google") {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: authHeader,
    });
    const data = await res.json();
    if (!res.ok || !data.email) throw new Error("구글 프로필 조회 실패");
    return { providerAccountId: data.sub, email: data.email, name: data.name ?? data.email };
  }

  if (provider === "github") {
    const [userRes, emailsRes] = await Promise.all([
      fetch("https://api.github.com/user", {
        headers: { ...authHeader, "User-Agent": "burnae.kr" },
      }),
      fetch("https://api.github.com/user/emails", {
        headers: { ...authHeader, "User-Agent": "burnae.kr" },
      }),
    ]);
    const user = await userRes.json();
    if (!userRes.ok) throw new Error("깃허브 프로필 조회 실패");

    let email: string | undefined = user.email ?? undefined;
    if (emailsRes.ok) {
      const emails = (await emailsRes.json()) as { email: string; primary: boolean; verified: boolean }[];
      const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
      if (primary) email = primary.email;
    }
    if (!email) throw new Error("깃허브 계정에 공개/인증된 이메일이 없습니다. GitHub 이메일 설정을 확인해주세요.");

    return { providerAccountId: String(user.id), email, name: user.name ?? user.login };
  }

  // discord
  const res = await fetch("https://discord.com/api/users/@me", { headers: authHeader });
  const data = await res.json();
  if (!res.ok) throw new Error("디스코드 프로필 조회 실패");
  if (!data.email) {
    throw new Error("디스코드 계정에 인증된 이메일이 없습니다. 디스코드에서 이메일을 인증해주세요.");
  }
  return {
    providerAccountId: data.id,
    email: data.email,
    name: data.global_name ?? data.username,
  };
}

export async function completeOAuthLogin(
  provider: OAuthProviderKey,
  code: string,
): Promise<OAuthProfile> {
  const accessToken = await exchangeCodeForToken(provider, code);
  return fetchProfile(provider, accessToken);
}
