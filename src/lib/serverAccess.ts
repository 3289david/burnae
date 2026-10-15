import { prisma } from "@/lib/prisma";
import type { User } from "@/generated/prisma/client";
import { hasAdminRole } from "@/lib/auth";
import { type ServerAccessRole, hasServerRank } from "@/lib/serverRoleRank";

export type { ServerAccessRole };
export { hasServerRank };

/**
 * 서버 소유자이거나, 팀 멤버로 초대된 유저인지 확인한다.
 * 관리자 전체 접근은 /admin/servers 메뉴 권한(adminAreas.ts)과 똑같이 GENERAL/SUPER로만
 * 제한한다 — COMMUNITY/PROMOTION 역할 관리자가 role==="ADMIN"이라는 이유만으로 고객의
 * 서버(SFTP 비밀번호 재발급, 콘솔, 파일 등)에 접근할 수 있으면 안 된다.
 *
 * 주의: 이 함수는 "서버에 들어올 수 있는지"만 본다 — 초대된 팀 멤버는 역할(VIEWER 등)과
 * 상관없이 전부 통과한다. 콘솔 명령 실행, 파일 삭제, 백업 삭제처럼 민감한 동작을 막으려면
 * 이 함수를 통과한 뒤에 추가로 getServerRole()/hasServerRank()로 역할을 확인해야 한다.
 */
export async function authorizeServerAccess(user: User, serverId: string) {
  const server = await prisma.server.findFirst({
    where: { id: serverId, deletedAt: null },
  });
  if (!server) return null;
  if (user.role === "ADMIN" && hasAdminRole(user, ["GENERAL", "SUPER"])) return server;
  if (server.ownerId === user.id) return server;

  const member = await prisma.serverMember.findUnique({
    where: { serverId_userId: { serverId, userId: user.id } },
  });
  return member ? server : null;
}

/**
 * authorizeServerAccess로 접근 자체는 확인한 뒤, 그 유저가 이 서버에서 정확히 어떤 역할인지
 * 돌려준다(소유자/Burnae 운영진/팀 멤버 역할/비회원=null). server는 authorizeServerAccess가
 * 돌려준 것과 같은 서버 레코드를 그대로 넘기면 된다 — 다시 조회하지 않는다.
 */
export async function getServerRole(
  user: User,
  server: { id: string; ownerId: string },
): Promise<ServerAccessRole | null> {
  if (server.ownerId === user.id) return "OWNER";
  if (user.role === "ADMIN" && hasAdminRole(user, ["GENERAL", "SUPER"])) return "ADMIN_STAFF";
  const member = await prisma.serverMember.findUnique({
    where: { serverId_userId: { serverId: server.id, userId: user.id } },
  });
  return member?.role ?? null;
}
