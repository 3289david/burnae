import { PteroClient } from "@/lib/pterodactyl";
import type { Server } from "@/generated/prisma/client";

/**
 * 환경변수 그룹(Render의 Environment Group)의 {KEY: value}를 실제 서버의 시작 변수(Pterodactyl)에
 * 밀어넣는다 — 그룹 자체는 이 함수가 호출될 때(생성/수정/서버 연결 시점)만 실제로 반영된다.
 * 서버가 아직 준비 중이거나 특정 키를 egg가 변수로 등록 안 해둔 경우 실패할 수 있어서, 키 하나가
 * 실패해도 나머지는 계속 적용하고 실패한 키 목록을 돌려준다.
 */
export async function applyEnvGroupToServer(
  variables: Record<string, string>,
  server: Pick<Server, "pterodactylIdentifier">,
): Promise<{ ok: boolean; failedKeys: string[] }> {
  if (!server.pterodactylIdentifier) return { ok: false, failedKeys: Object.keys(variables) };

  const failedKeys: string[] = [];
  for (const [key, value] of Object.entries(variables)) {
    try {
      await PteroClient.updateStartupVariable(server.pterodactylIdentifier, key, value);
    } catch {
      failedKeys.push(key);
    }
  }
  return { ok: failedKeys.length === 0, failedKeys };
}
