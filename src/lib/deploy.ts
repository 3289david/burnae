import { prisma } from "@/lib/prisma";
import { PteroClient } from "@/lib/pterodactyl";
import { logServerActivity } from "@/lib/serverActivityLog";
import { sendDiscordDM } from "@/lib/discordNotify";
import type { Server } from "@/generated/prisma/client";

const FAILURE_PATTERN = /fatal:|error:|Permission denied|Could not resolve host|command not found/i;

/**
 * git pull(+선택적 빌드 명령) + 재시작으로 서버를 다시 배포한다 — StartupVariablesCard의
 * "저장소에서 설치하기"(전체 재설치, 기존 파일 대부분 삭제)와 달리 이건 기존 .git 저장소에
 * 이어서 최신 커밋만 받아오는 가벼운 갱신이다. 그래서 GIT_ADDRESS로 이미 한 번 설치된 적
 * 있는 서버에서만 의미가 있다 — egg 설치 스크립트가 처음 설치할 때 그 디렉터리에 .git을 만든다.
 */
export async function redeployFromGit(server: Server, actorId: string | null): Promise<{ ok: boolean; output: string }> {
  if (!server.pterodactylIdentifier) {
    return { ok: false, output: "서버가 아직 준비 중이에요." };
  }

  const pullLines = await PteroClient.runCommandAndCapture(server.pterodactylIdentifier, "git pull", 10000).catch((err) => {
    console.error(`[deploy] 서버 ${server.id} git pull 실패:`, err);
    return null;
  });

  if (pullLines === null) {
    await logServerActivity(server.id, actorId, "GIT_DEPLOY_FAILED", "git pull 명령 전송 실패");
    await notifyDeployResult(server, false, "git pull 명령 전송 실패");
    return { ok: false, output: "콘솔에 명령을 보내지 못했어요." };
  }

  let output = pullLines.join("\n");

  // 빌드 명령이 설정돼 있으면(예: npm install && npm run build) pull 다음, 재시작 전에 실행한다 —
  // Render/Railway의 "build command"와 같은 개념. 느릴 수 있어서 좀 더 길게 기다린다
  if (server.buildCommand) {
    const buildLines = await PteroClient.runCommandAndCapture(server.pterodactylIdentifier, server.buildCommand, 30000).catch(
      (err) => {
        console.error(`[deploy] 서버 ${server.id} 빌드 명령 실패:`, err);
        return null;
      },
    );
    if (buildLines) output += "\n" + buildLines.join("\n");
  }

  // Wings 콘솔 출력만으로 성공/실패를 완벽히 구분할 순 없지만, git/빌드의 전형적인 오류 문구가
  // 안 보이면 일단 성공으로 본다 — 실제 코드 동작 여부는 사용자가 콘솔 탭에서 직접 확인해야 한다
  const looksFailed = FAILURE_PATTERN.test(output);

  await PteroClient.sendPowerAction(server.pterodactylIdentifier, "restart").catch((err) => {
    console.error(`[deploy] 서버 ${server.id} 재시작 실패(배포 자체는 진행됨):`, err);
  });

  await logServerActivity(
    server.id,
    actorId,
    looksFailed ? "GIT_DEPLOY_FAILED" : "GIT_DEPLOY_SUCCESS",
    output.slice(0, 500),
  );
  await notifyDeployResult(server, !looksFailed, output.slice(0, 300));

  return { ok: !looksFailed, output };
}

/** 배포 결과를 소유자에게 디스코드 DM으로 알린다 — 연동 안 돼 있으면 조용히 건너뛴다 */
async function notifyDeployResult(server: Server, ok: boolean, detail: string) {
  const link = await prisma.discordLink.findUnique({ where: { userId: server.ownerId } });
  if (!link) return;
  const message = ok
    ? `🚀 **${server.name}** 배포가 완료됐어요!`
    : `⚠️ **${server.name}** 배포 중 문제가 있었던 것 같아요. 콘솔 탭에서 확인해주세요.\n\`\`\`${detail}\`\`\``;
  await sendDiscordDM(link.discordUserId, message).catch(() => {});
}

/** 이 서버가 GIT_ADDRESS를 지원하는 템플릿인지(= git 배포 기능을 보여줄 수 있는지) 확인한다 */
export async function supportsGitDeploy(templateId: string): Promise<boolean> {
  const template = await prisma.serverTemplate.findUnique({ where: { id: templateId } });
  if (!template) return false;
  const defaultEnv = template.defaultEnvironment as Record<string, unknown>;
  return "GIT_ADDRESS" in defaultEnv;
}
