import { resolveUserFromApiToken } from "@/lib/apiToken";
import type { User } from "@/generated/prisma/client";

/** /api/v1/* 공개 API 전용 — 세션 쿠키가 아니라 Authorization: Bearer <토큰> 헤더로 인증한다 */
export async function requireApiUser(request: Request): Promise<User | null> {
  return resolveUserFromApiToken(request.headers.get("authorization"));
}
