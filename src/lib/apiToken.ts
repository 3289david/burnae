import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { User } from "@/generated/prisma/client";

const TOKEN_PREFIX = "burn_";

/** sha256으로 저장 — 비밀번호와 같은 이유로 토큰 원문 자체는 DB 어디에도 남기지 않는다 */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** 토큰 생성 시 한 번만 돌려준다 — 그 뒤로는 다시 조회할 방법이 없다(해시만 저장하므로) */
export async function createApiToken(userId: string, name: string): Promise<{ id: string; token: string }> {
  const raw = crypto.randomBytes(32).toString("base64url");
  const token = `${TOKEN_PREFIX}${raw}`;
  const created = await prisma.apiToken.create({
    data: {
      userId,
      name,
      tokenHash: hashToken(token),
      prefix: token.slice(0, 12),
    },
  });
  return { id: created.id, token };
}

/** Authorization: Bearer <token> 헤더에서 토큰을 찾아 유저를 돌려준다 — 없거나 틀리면 null */
export async function resolveUserFromApiToken(authHeader: string | null): Promise<User | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token.startsWith(TOKEN_PREFIX)) return null;

  const record = await prisma.apiToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!record) return null;
  if (record.user.status !== "ACTIVE") return null;

  // 매번 쓰기는 과하니 10분에 한 번 정도만 lastUsedAt을 갱신한다
  if (!record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() > 10 * 60 * 1000) {
    await prisma.apiToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }

  return record.user;
}
