import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/generated/prisma/enums";
import type { AdminRole } from "@/generated/prisma/enums";

export type { AdminRole };

const COOKIE_NAME = "burnae_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30일

/**
 * 관리자 패널에 들어갈 수 있는 유일한 이메일.
 * DB의 role이 어떻게 바뀌든(버그, 실수 등) 이 이메일이 아니면 절대 관리자 화면에 접근할 수 없다.
 * .env의 ADMIN_EMAIL로 덮어쓸 수 있지만, 기본값 자체가 안전장치 역할을 한다.
 */
export function getAdminEmail(): string {
  return (process.env.ADMIN_EMAIL ?? "davideom0414@gmail.com").toLowerCase();
}

export function isAdminEmail(email: string): boolean {
  return email.toLowerCase() === getAdminEmail();
}

/** 신규 유저 생성 시 부여할 role — 관리자 이메일이 아니면 항상 USER */
export function resolveInitialRole(email: string): UserRole {
  return isAdminEmail(email) ? "ADMIN" : "USER";
}

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET 환경변수가 설정되지 않았거나 너무 짧습니다 (16자 이상 필요).",
    );
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  sub: string;
  role: UserRole;
  email: string;
}

export async function createSessionCookie(payload: SessionPayload) {
  const token = await new SignJWT({ role: payload.role, email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.sub !== "string") return null;
    return {
      sub: payload.sub,
      role: payload.role as UserRole,
      email: (payload.email as string) ?? "",
    };
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  return prisma.user.findUnique({ where: { id: session.sub } });
}

/** API 라우트에서 사용 — 로그인 안 되어 있으면 null */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") return null;
  return user;
}

/**
 * 소유자 이메일(getAdminEmail)은 항상 통과한다(권한 체계가 깨져도 이 계정만은 확실히 들어갈 수
 * 있게 하는 안전장치). 그 외에는 role=ADMIN이고 adminRole이 지정돼 있어야 관리자 패널에 들어갈 수
 * 있다 — 어느 영역까지 볼 수 있는지는 hasAdminRole/requireAdminRole로 또 한 번 좁힌다.
 */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") return null;
  if (isAdminEmail(user.email)) return user;
  if (user.role === "ADMIN" && user.adminRole) return user;
  return null;
}

/** 소유자이거나 adminRole이 SUPER이면 항상 true — 모든 관리자 영역에 접근 가능 */
export function isSuperAdmin(user: { email: string; adminRole: AdminRole | null }): boolean {
  return isAdminEmail(user.email) || user.adminRole === "SUPER";
}

export function hasAdminRole(
  user: { email: string; adminRole: AdminRole | null },
  allowed: AdminRole[],
): boolean {
  if (isSuperAdmin(user)) return true;
  return user.adminRole != null && allowed.includes(user.adminRole);
}

/** requireAdmin + 특정 영역(allowed) 권한까지 함께 확인 — 관리자 API 라우트에서 영역별로 쓴다 */
export async function requireAdminRole(allowed: AdminRole[]) {
  const user = await requireAdmin();
  if (!user) return null;
  if (!hasAdminRole(user, allowed)) return null;
  return user;
}
