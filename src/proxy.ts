import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { siteUrl } from "@/lib/oauth";

const COOKIE_NAME = "burnae_session";

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

  // 여기서는 "로그인 + role=ADMIN"만 낙관적으로 확인한다 — 실제로 어느 관리자 영역까지
  // 들어갈 수 있는지(소유자 이메일/adminRole)는 Edge에서 DB를 못 보니 여기서 판단하지 않고,
  // admin/layout.tsx와 각 /api/admin/* 라우트가 requireAdmin/requireAdminRole로 정식 판단한다.
  if (pathname.startsWith("/admin")) {
    if (!session || session.role !== "ADMIN") {
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
