import type { PrismaClient } from "@/generated/prisma/client";
// 상대 경로로 가져온다 — 이 파일은 디스코드 봇 프로세스(tsx 실행, @/ 별칭 미지원)에서도
// 그대로 불러 쓰므로, 런타임에 실제로 로드되는 import는 별칭에 의존하면 안 된다.
import { PteroApp } from "./pterodactyl";

/**
 * 포인트 교환 등으로 만든 무료 서버는 결제 서버(30일 만기)와 달리 7일마다 직접 갱신해야 한다 —
 * 방치된 무료 서버가 자원을 계속 차지하는 걸 막기 위함. 대시보드 버튼과 디스코드 /갱신 명령어가
 * 이 함수를 공통으로 쓴다(타입 순환 참조를 피하려 prisma 클라이언트를 인자로 받는다 — 봇 프로세스는
 * 자체 PrismaClient 인스턴스를 쓰고, 웹 앱은 @/lib/prisma의 싱글턴을 쓴다).
 */
export const FREE_SERVER_RENEWAL_DAYS = 7;

export class ServerRenewalError extends Error {}

export async function renewFreeServer(
  prisma: PrismaClient,
  serverId: string,
  requestingUserId: string,
) {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    include: { product: true },
  });
  if (!server || server.deletedAt) {
    throw new ServerRenewalError("서버를 찾을 수 없습니다.");
  }
  if (server.ownerId !== requestingUserId) {
    throw new ServerRenewalError("본인 서버만 갱신할 수 있어요.");
  }
  if (!server.product.pointsRedeemable) {
    throw new ServerRenewalError("이 서버는 결제로 갱신하는 서버예요. 대시보드에서 결제 갱신을 이용해주세요.");
  }

  if (server.status === "SUSPENDED" && server.pterodactylServerId) {
    await PteroApp.unsuspendServer(server.pterodactylServerId);
  }

  const renewalDueAt = new Date(Date.now() + FREE_SERVER_RENEWAL_DAYS * 24 * 60 * 60 * 1000);
  return prisma.server.update({
    where: { id: serverId },
    data: { renewalDueAt, status: server.status === "SUSPENDED" ? "STOPPED" : server.status },
  });
}
