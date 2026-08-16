import { prisma } from "@/lib/prisma";
import type { User } from "@/generated/prisma/client";

/** 서버 소유자이거나, 팀 멤버로 초대된 유저인지 확인 (관리자는 전체 접근 가능) */
export async function authorizeServerAccess(user: User, serverId: string) {
  const server = await prisma.server.findFirst({
    where: { id: serverId, deletedAt: null },
  });
  if (!server) return null;
  if (user.role === "ADMIN") return server;
  if (server.ownerId === user.id) return server;

  const member = await prisma.serverMember.findUnique({
    where: { serverId_userId: { serverId, userId: user.id } },
  });
  return member ? server : null;
}
