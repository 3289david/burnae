import { prisma } from "@/lib/prisma";

/** 기본 1개 + 포인트 상점(EXTRA_FREE_SLOT)으로 산 아직 안 만료된 임시 슬롯 수 */
export async function getFreeServerLimit(userId: string): Promise<number> {
  const activeGrants = await prisma.extraFreeSlotGrant.count({
    where: { userId, expiresAt: { gt: new Date() } },
  });
  return 1 + activeGrants;
}
