import { prisma } from "@/lib/prisma";
import { SERVER_ACTIVITY_LABELS } from "@/lib/serverActivityLabels";

/** 실패해도 원래 작업(전원 조작 등)을 막으면 안 되므로 조용히 무시한다 */
export async function logServerActivity(
  serverId: string,
  actorId: string | null,
  action: keyof typeof SERVER_ACTIVITY_LABELS,
  detail?: string,
) {
  try {
    await prisma.serverActivityLog.create({
      data: { serverId, actorId, action, detail },
    });
  } catch {
    // 로그 실패는 무시 — 활동 로그는 부가 기능이라 본 작업 흐름을 막지 않는다
  }
}
