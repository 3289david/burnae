import { prisma } from "@/lib/prisma";

/** nginx가 X-Real-IP/X-Forwarded-For로 전달한 실제 접속자 IP를 뽑는다 */
export function extractClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  const real = request.headers.get("x-real-ip");
  return real?.trim() ?? null;
}

/**
 * 같은 가입 IP를 쓰는 다른 계정이 이미 무료 서버를 갖고 있으면 그 계정 id 목록을 돌려준다
 * (비면 부계정 의심 없음). 같은 공유 와이파이/사내망/VPN에서 가입한 서로 다른 사람일 수도
 * 있어서 계정을 정지하진 않고, 무료 서버 1인 1개 제한을 더 늘리는 것만 막는다.
 */
export async function findAltAccountsWithFreeServer(currentUserId: string, signupIp: string | null): Promise<string[]> {
  if (!signupIp) return [];

  const others = await prisma.user.findMany({
    where: { signupIp, id: { not: currentUserId } },
    select: { id: true },
  });
  if (others.length === 0) return [];

  const withFreeServer = await prisma.server.findMany({
    where: {
      ownerId: { in: others.map((o) => o.id) },
      deletedAt: null,
      product: { priceMonthlyKrw: 0 },
    },
    select: { ownerId: true },
    distinct: ["ownerId"],
  });
  return withFreeServer.map((s) => s.ownerId);
}
