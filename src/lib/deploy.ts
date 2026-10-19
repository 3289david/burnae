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
export async function redeployFromGit(
  server: Server,
  actorId: string | null,
  trigger: "MANUAL" | "WEBHOOK" = "MANUAL",
): Promise<{ ok: boolean; output: string }> {
  const startedAt = Date.now();
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
    await recordDeploymentLog(server.id, trigger, actorId, false, "git pull 명령 전송 실패", startedAt);
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
  await recordDeploymentLog(server.id, trigger, actorId, !looksFailed, output, startedAt);

  return { ok: !looksFailed, output };
}

/** Render/Railway 스타일 "배포 이력" 화면용 — GitDeployCard가 서버당 최근 기록을 보여준다 */
async function recordDeploymentLog(
  serverId: string,
  trigger: "MANUAL" | "WEBHOOK",
  actorUserId: string | null,
  success: boolean,
  output: string,
  startedAt: number,
) {
  await prisma.deploymentLog
    .create({
      data: {
        serverId,
        trigger,
        actorUserId,
        success,
        output: output.slice(0, 2000),
        durationMs: Date.now() - startedAt,
      },
    })
    .catch((err) => console.error(`[deploy] 배포 기록 저장 실패(배포 자체는 정상 진행됨):`, err));
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

/** https://host/path 형태의 URL 어딘가에 credential(토큰/x-access-token:토큰)이 박혀 있으면
 * 가려서 돌려준다 — 저장소 주소 자체는 보여줘도 되지만 그 안의 비밀값은 다시 노출하면 안 된다 */
export function maskGitCredentials(address: string): string {
  try {
    const url = new URL(address);
    if (url.username || url.password) {
      url.username = "***";
      url.password = "";
    }
    return url.toString();
  } catch {
    return address;
  }
}

/** HTTPS 저장소 주소에 Personal Access Token을 끼워 넣는다 — GitHub/GitLab/Bitbucket 모두
 * "https://<token>@host/path" 형태를 그대로 지원해서 호스트별 분기 없이 동작한다 */
export function embedGitToken(address: string, token: string): string {
  const url = new URL(address);
  url.username = encodeURIComponent(token);
  url.password = "";
  return url.toString();
}

/**
 * 기존 작업 디렉터리를 그대로 두고(파일 삭제 없이) git remote만 다른 저장소로 바꾼 뒤 pull —
 * StartupVariablesCard의 "저장소에서 설치하기"(전체 재설치)보다 훨씬 가볍게 "연결된 저장소를
 * 바꾸는" 기능. 바뀐 주소는 egg 시작 변수(GIT_ADDRESS)에도 그대로 반영해서 다음에 다시
 * 조회했을 때(또는 재설치 시) 같은 저장소를 계속 가리키게 한다.
 */
export async function changeGitRemote(
  server: Server,
  newAddress: string,
  actorId: string,
): Promise<{ ok: boolean; output: string }> {
  if (!server.pterodactylIdentifier) {
    return { ok: false, output: "서버가 아직 준비 중이에요." };
  }

  await PteroClient.runCommandAndCapture(server.pterodactylIdentifier, `git remote set-url origin ${newAddress}`, 5000).catch(
    (err) => console.error(`[deploy] 서버 ${server.id} git remote 변경 실패:`, err),
  );
  await PteroClient.updateStartupVariable(server.pterodactylIdentifier, "GIT_ADDRESS", newAddress).catch((err) =>
    console.error(`[deploy] 서버 ${server.id} GIT_ADDRESS 시작 변수 갱신 실패:`, err),
  );

  return redeployFromGit(server, actorId, "MANUAL");
}
