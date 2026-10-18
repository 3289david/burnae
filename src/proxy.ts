import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { siteUrl } from "@/lib/oauth";
import { routing } from "@/i18n/routing";

const COOKIE_NAME = "burnae_session";
const LOCALE_COOKIE = "NEXT_LOCALE";
// next-intl이 서버 컴포넌트에서 getRequestConfig의 requestLocale을 읽을 때 보는 헤더 —
// next-intl 자체 미들웨어를 안 쓰고 직접 라우팅을 구현했기 때문에 이 헤더를 손수 심어줘야
// (특히 동적 렌더링 페이지에서) 번역이 항상 기본 로케일로만 떨어지는 문제가 생기지 않는다.
const NEXT_INTL_LOCALE_HEADER = "X-NEXT-INTL-LOCALE";

async function readSession(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return { role: payload.role as string | undefined, email: payload.email as string | undefined };
  } catch {
    return null;
  }
}

/**
 * 처음 방문한 사람의 언어를 고른다 — 쿠키(한 번 정해지면 그다음부터는 이걸 따름) → Cloudflare가
 * 붙여주는 접속 국가 헤더(한국이면 kr, 그 외엔 en) → 브라우저 Accept-Language → 기본값(kr) 순.
 * 사용자가 "위치 기반으로" 언어를 정해달라고 명시적으로 요청해서 Accept-Language보다 국가
 * 헤더를 우선한다(VPN 등으로 브라우저 언어와 실제 접속 위치가 다른 경우가 흔해서).
 */
function detectLocale(request: NextRequest): "kr" | "en" {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (cookieLocale === "kr" || cookieLocale === "en") return cookieLocale;

  const country = request.headers.get("cf-ipcountry");
  if (country) return country.toUpperCase() === "KR" ? "kr" : "en";

  const acceptLanguage = request.headers.get("accept-language") ?? "";
  if (acceptLanguage.toLowerCase().includes("ko")) return "kr";
  if (acceptLanguage.length > 0) return "en";

  return routing.defaultLocale;
}

function stripLocalePrefix(pathname: string): { locale: "kr" | "en"; rest: string } | null {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) return { locale, rest: "/" };
    if (pathname.startsWith(`/${locale}/`)) return { locale, rest: pathname.slice(locale.length + 1) };
  }
  return null;
}

// public/downloads/ 안에는 확장자 없는 바이너리(burnae-sshd-amd64 등)가 있어서 matcher의
// "점(.) 없으면 로케일 대상"이라는 일반 규칙만으로는 못 걸러낸다 — SSH 바이너리 등 서버
// 컨테이너가 curl로 직접 받는 파일이라 로케일 리다이렉트가 붙으면 다운로드 자체가 깨진다.
const LOCALE_BYPASS_PREFIXES = ["/downloads/"];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (LOCALE_BYPASS_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const stripped = stripLocalePrefix(pathname);
  if (!stripped) {
    const locale = detectLocale(request);
    const url = new URL(`/${locale}${pathname}${search}`, request.url);
    const response = NextResponse.redirect(url);
    response.cookies.set(LOCALE_COOKIE, locale, { maxAge: 60 * 60 * 24 * 365, path: "/" });
    return response;
  }

  const { locale, rest } = stripped;
  const session = await readSession(request);

  // 여기서는 "로그인 + role=ADMIN"만 낙관적으로 확인한다 — 실제로 어느 관리자 영역까지
  // 들어갈 수 있는지(소유자 이메일/adminRole)는 Edge에서 DB를 못 보니 여기서 판단하지 않고,
  // admin/layout.tsx와 각 /api/admin/* 라우트가 requireAdmin/requireAdminRole로 정식 판단한다.
  if (rest.startsWith("/admin")) {
    if (!session || session.role !== "ADMIN") {
      const loginUrl = new URL(`/${locale}/login`, siteUrl());
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  if (rest.startsWith("/dashboard")) {
    if (!session) {
      const loginUrl = new URL(`/${locale}/login`, siteUrl());
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NEXT_INTL_LOCALE_HEADER, locale);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (!request.cookies.get(LOCALE_COOKIE)) {
    response.cookies.set(LOCALE_COOKIE, locale, { maxAge: 60 * 60 * 24 * 365, path: "/" });
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
