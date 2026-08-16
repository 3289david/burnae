import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/generated/prisma/enums";

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

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
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

/** role뿐 아니라 이메일까지 반드시 일치해야 통과 — 관리자 패널은 오직 이 계정만 */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") return null;
  if (user.role !== "ADMIN" || !isAdminEmail(user.email)) return null;
  return user;
}
