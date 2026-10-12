import type { PrismaClient } from "@/generated/prisma/client";

/**
 * 포인트 상점에서 RAM/CPU/저장공간을 증설하면 영구가 아니라 이 기간(60일)만 유지된다 —
 * 만료 전 대시보드에서 갱신하지 않으면 크론이 자동으로 원래 크기로 되돌린다. 방치된 무료
 * 서버가 자원을 영구히 차지하는 걸 막기 위함(무료 서버 자체의 7일 갱신과 같은 취지).
 */
export const RESOURCE_UPGRADE_RENEWAL_DAYS = 60;

/** 추가 포트/서브도메인은 RAM/CPU/저장공간보다 자원 점유가 작아 더 긴 주기(120일)로 갱신한다 */
export const EXTRA_RESOURCE_RENEWAL_DAYS = 120;

/** 증설 종류별로 갱신 주기가 다르므로 kind를 보고 알맞은 일수를 돌려준다 */
export function renewalDaysFor(kind: string): number {
  return kind === "EXTRA_PORT" || kind === "EXTRA_SUBDOMAIN" ? EXTRA_RESOURCE_RENEWAL_DAYS : RESOURCE_UPGRADE_RENEWAL_DAYS;
}

export class ResourceUpgradeRenewalError extends Error {}

/** serverId는 호출부에서 이미 소유권 확인(authorizeServerAccess)을 마친 서버여야 한다 */
export async function renewResourceUpgradeGrant(prisma: PrismaClient, grantId: string, serverId: string) {
  const grant = await prisma.resourceUpgradeGrant.findUnique({ where: { id: grantId } });
  if (!grant || grant.serverId !== serverId) {
    throw new ResourceUpgradeRenewalError("증설 항목을 찾을 수 없습니다.");
  }

  const expiresAt = new Date(Date.now() + renewalDaysFor(grant.kind) * 24 * 60 * 60 * 1000);
  return prisma.resourceUpgradeGrant.update({ where: { id: grantId }, data: { expiresAt } });
}
