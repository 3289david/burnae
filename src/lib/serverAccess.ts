import { prisma } from "@/lib/prisma";
import type { User } from "@/generated/prisma/client";
import { hasAdminRole } from "@/lib/auth";

/**
 * 서버 소유자이거나, 팀 멤버로 초대된 유저인지 확인한다.
 * 관리자 전체 접근은 /admin/servers 메뉴 권한(adminAreas.ts)과 똑같이 GENERAL/SUPER로만
 * 제한한다 — COMMUNITY/PROMOTION 역할 관리자가 role==="ADMIN"이라는 이유만으로 고객의
 * 서버(SFTP 비밀번호 재발급, 콘솔, 파일 등)에 접근할 수 있으면 안 된다.
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
