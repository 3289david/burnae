import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { siteUrl } from "@/lib/oauth";

const COOKIE_NAME = "burnae_session";

// lib/auth.ts는 Node 전용 모듈(prisma, next/headers)을 물고 있어 Edge에서 못 쓰므로
// 관리자 이메일 검증 로직을 여기서도 최소한으로 복제해둔다 (안전장치는 이중으로).
function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  const adminEmail = (process.env.ADMIN_EMAIL ?? "davideom0414@gmail.com").toLowerCase();
  return email.toLowerCase() === adminEmail;
}

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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await readSession(request);

  if (pathname.startsWith("/admin")) {
    if (!session || session.role !== "ADMIN" || !isAdminEmail(session.email)) {
      const loginUrl = new URL("/login", siteUrl());
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  if (pathname.startsWith("/dashboard")) {
    if (!session) {
      const loginUrl = new URL("/login", siteUrl());
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*"],
};
