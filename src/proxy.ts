import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { siteUrl } from "@/lib/oauth";

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
 * 영어 지원 제거 — 한국어 단독 지원. 예전엔 모든 URL에 /kr 접두사를 강제로 붙였는데(always),
 * 로케일이 하나뿐인데 굳이 burnae.kr/kr/...로 보일 이유가 없어서(사용자가 명시적으로 지적함)
 * 이제 겉으로 보이는 URL에는 접두사를 아예 안 붙인다. 다만 실제 페이지 트리는 여전히
 * app/[locale]/* 밑에 있으므로(이동 비용이 커서 그대로 둠), 접두사 없는 요청은 내부적으로
 * /kr/*로 rewrite(브라우저 주소창은 그대로 유지)해서 넘기고, 반대로 누가 /kr/*로 직접 들어오면
 * (옛 북마크/공유 링크) 접두사 없는 깨끗한 URL로 308 리다이렉트해서 정규화한다.
 */
const LOCALE = "kr";

function stripLocalePrefix(pathname: string): string | null {
  if (pathname === `/${LOCALE}`) return "/";
  if (pathname.startsWith(`/${LOCALE}/`)) return pathname.slice(LOCALE.length + 1);
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

  // /en 또는 /en/* 요청은 접두사 없는 동일 경로로 308 영구 리디렉트
  if (pathname === "/en" || pathname.startsWith("/en/")) {
    const rest = pathname === "/en" ? "/" : pathname.slice(3);
    const url = new URL(`${rest}${search}`, request.url);
    const response = NextResponse.redirect(url, 308);
    response.cookies.set(LOCALE_COOKIE, LOCALE, { maxAge: 60 * 60 * 24 * 365, path: "/" });
    return response;
  }

  // /kr 또는 /kr/*로 직접 들어오면(옛 링크) 접두사 없는 깨끗한 URL로 영구 리다이렉트
  const stripped = stripLocalePrefix(pathname);
  if (stripped !== null) {
    const url = new URL(`${stripped}${search}`, request.url);
    const response = NextResponse.redirect(url, 308);
    response.cookies.set(LOCALE_COOKIE, LOCALE, { maxAge: 60 * 60 * 24 * 365, path: "/" });
    return response;
  }

  // 그 외 모든 경로는 접두사 없이 그대로 보이되, 내부적으로는 /kr/* 페이지 트리로 rewrite한다
  const rest = pathname;
  const locale = LOCALE;
  const session = await readSession(request);

  // 여기서는 "로그인 + role=ADMIN"만 낙관적으로 확인한다 — 실제로 어느 관리자 영역까지
  // 들어갈 수 있는지(소유자 이메일/adminRole)는 Edge에서 DB를 못 보니 여기서 판단하지 않고,
  // admin/layout.tsx와 각 /api/admin/* 라우트가 requireAdmin/requireAdminRole로 정식 판단한다.
  if (rest.startsWith("/admin")) {
    if (!session || session.role !== "ADMIN") {
      const loginUrl = new URL("/login", siteUrl());
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  if (rest.startsWith("/dashboard")) {
    if (!session) {
      const loginUrl = new URL("/login", siteUrl());
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // 실제 페이지 트리는 app/[locale]/* 밑에 있으니, 접두사 없이 들어온 요청을 내부적으로
  // /kr/*로 rewrite한다 — 브라우저 주소창은 그대로 접두사 없는 URL을 유지한다.
  const rewriteUrl = new URL(`/${locale}${pathname}${search}`, request.url);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NEXT_INTL_LOCALE_HEADER, locale);
  const response = NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } });
  if (request.cookies.get(LOCALE_COOKIE)?.value !== "kr") {
    response.cookies.set(LOCALE_COOKIE, "kr", { maxAge: 60 * 60 * 24 * 365, path: "/" });
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
