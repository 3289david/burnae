import type { ServerMemberRole } from "@/generated/prisma/enums";

/** 소유자/Burnae 운영 관리자를 ServerMemberRole 체계 위쪽에 덧붙인 확장 역할 */
export type ServerAccessRole = "OWNER" | "ADMIN_STAFF" | ServerMemberRole;

/// 숫자가 클수록 더 많은 걸 할 수 있다. OWNER와 ADMIN_STAFF(Burnae 운영 GENERAL/SUPER)는
/// 항상 최고 등급 — 소유자가 위임한 팀 멤버 ADMIN보다도 위다.
export const SERVER_ROLE_RANK: Record<ServerAccessRole, number> = {
  VIEWER: 0,
  MODERATOR: 1,
  DEVELOPER: 2,
  ADMIN: 3,
  OWNER: 4,
  ADMIN_STAFF: 4,
};

/** 서버 전용 모듈(prisma/next-auth)을 안 끌어와서 클라이언트 컴포넌트에서도 그대로 쓸 수 있다. */
export function hasServerRank(role: ServerAccessRole | null | undefined, min: ServerAccessRole): boolean {
  if (!role) return false;
  return SERVER_ROLE_RANK[role] >= SERVER_ROLE_RANK[min];
}
