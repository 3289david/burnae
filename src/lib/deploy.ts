import { prisma } from "@/lib/prisma";
import { PteroClient } from "@/lib/pterodactyl";
import { logServerActivity } from "@/lib/serverActivityLog";
import type { Server } from "@/generated/prisma/client";

/**
 * git pull + 재시작으로 서버를 다시 배포한다 — StartupVariablesCard의 "저장소에서 설치하기"
 * (전체 재설치, 기존 파일 대부분 삭제)와 달리 이건 기존 .git 저장소에 이어서 최신 커밋만
 * 받아오는 가벼운 갱신이다. 그래서 GIT_ADDRESS로 이미 한 번 설치된 적 있는 서버에서만 의미가
 * 있다 — egg 설치 스크립트가 처음 설치할 때 그 디렉터리에 .git을 만들어둔다.
 */
export async function redeployFromGit(server: Server, actorId: string | null): Promise<{ ok: boolean; output: string }> {
  if (!server.pterodactylIdentifier) {
    return { ok: false, output: "서버가 아직 준비 중이에요." };
  }

  const lines = await PteroClient.runCommandAndCapture(server.pterodactylIdentifier, "git pull", 10000).catch((err) => {
    console.error(`[deploy] 서버 ${server.id} git pull 실패:`, err);
    return null;
  });

  if (lines === null) {
    await logServerActivity(server.id, actorId, "GIT_DEPLOY_FAILED", "git pull 명령 전송 실패");
    return { ok: false, output: "콘솔에 명령을 보내지 못했어요." };
  }

  const output = lines.join("\n");
  // Wings 콘솔 출력만으로 성공/실패를 완벽히 구분할 순 없지만, git의 전형적인 오류 문구가
  // 안 보이면 일단 성공으로 본다 — 실제 코드 동작 여부는 사용자가 콘솔 탭에서 직접 확인해야 한다
  const looksFailed = /fatal:|error:|Permission denied|Could not resolve host/i.test(output);

  await PteroClient.sendPowerAction(server.pterodactylIdentifier, "restart").catch((err) => {
    console.error(`[deploy] 서버 ${server.id} 재시작 실패(배포 자체는 진행됨):`, err);
  });

  await logServerActivity(
    server.id,
    actorId,
    looksFailed ? "GIT_DEPLOY_FAILED" : "GIT_DEPLOY_SUCCESS",
    output.slice(0, 500),
  );

  return { ok: !looksFailed, output };
}

/** 이 서버가 GIT_ADDRESS를 지원하는 템플릿인지(= git 배포 기능을 보여줄 수 있는지) 확인한다 */
export async function supportsGitDeploy(templateId: string): Promise<boolean> {
  const template = await prisma.serverTemplate.findUnique({ where: { id: templateId } });
  if (!template) return false;
  const defaultEnv = template.defaultEnvironment as Record<string, unknown>;
  return "GIT_ADDRESS" in defaultEnv;
}
