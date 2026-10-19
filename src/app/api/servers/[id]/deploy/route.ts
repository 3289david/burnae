import crypto from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess, getServerRole, hasServerRank } from "@/lib/serverAccess";
import { prisma } from "@/lib/prisma";
import { withApiErrorHandling } from "@/lib/apiHandler";
import { redeployFromGit, supportsGitDeploy, maskGitCredentials } from "@/lib/deploy";
import { siteUrl } from "@/lib/oauth";
import { PteroClient } from "@/lib/pterodactyl";

/** Git 자동 배포 설정 조회 — 콘솔/파일 접근과 같은 기준(DEVELOPER 이상)으로 본다 */
export const GET = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (!hasServerRank(await getServerRole(user, server), "DEVELOPER")) {
    return NextResponse.json({ error: "배포 설정을 볼 권한이 없어요." }, { status: 403 });
  }

  const supportsGit = await supportsGitDeploy(server.templateId);

  let currentRepoUrl: string | null = null;
  if (supportsGit && server.pterodactylIdentifier) {
    const variables = await PteroClient.getStartupVariables(server.pterodactylIdentifier).catch(() => null);
    const raw = variables?.find((v) => v.envVariable === "GIT_ADDRESS")?.serverValue;
    if (raw) currentRepoUrl = maskGitCredentials(raw);
  }

  const githubConnection = await prisma.gitHubConnection.findUnique({ where: { userId: user.id } });

  return NextResponse.json({
    supportsGit,
    autoDeployEnabled: server.autoDeployEnabled,
    webhookUrl: `${siteUrl()}/api/webhooks/github-deploy/${server.id}`,
    hasSecret: !!server.deployWebhookSecret,
    deployWebhookSecret: server.deployWebhookSecret,
    buildCommand: server.buildCommand,
    currentRepoUrl,
    githubLogin: githubConnection?.githubLogin ?? null,
    gitBranch: server.gitBranch,
    deployNotifyWebhookUrl: server.deployNotifyWebhookUrl,
    healthCheckPath: server.healthCheckPath,
  });
});

const patchSchema = z.object({
  enabled: z.boolean(),
  rotateSecret: z.boolean().optional(),
  buildCommand: z.string().max(500).optional().nullable(),
  gitBranch: z.string().max(200).optional().nullable(),
  deployNotifyWebhookUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
});

/** 자동 배포 켜고 끄기 + 웹훅 비밀값 발급 — 소유자만(웹훅 URL+비밀값은 누구나 호출 가능한 외부
 * 진입점을 만드는 설정이라 팀 멤버에게는 안 넘긴다) */
export const PATCH = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (server.ownerId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "서버 소유자만 바꿀 수 있어요." }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  const needsSecret = parsed.data.enabled && (!server.deployWebhookSecret || parsed.data.rotateSecret);
  const updated = await prisma.server.update({
    where: { id },
    data: {
      autoDeployEnabled: parsed.data.enabled,
      ...(needsSecret ? { deployWebhookSecret: crypto.randomBytes(24).toString("hex") } : {}),
      ...(parsed.data.buildCommand !== undefined ? { buildCommand: parsed.data.buildCommand } : {}),
      ...(parsed.data.gitBranch !== undefined ? { gitBranch: parsed.data.gitBranch || null } : {}),
      ...(parsed.data.deployNotifyWebhookUrl !== undefined ? { deployNotifyWebhookUrl: parsed.data.deployNotifyWebhookUrl || null } : {}),
    },
  });

  return NextResponse.json({
    autoDeployEnabled: updated.autoDeployEnabled,
    webhookUrl: `${siteUrl()}/api/webhooks/github-deploy/${updated.id}`,
    deployWebhookSecret: updated.deployWebhookSecret,
    buildCommand: updated.buildCommand,
    gitBranch: updated.gitBranch,
    deployNotifyWebhookUrl: updated.deployNotifyWebhookUrl,
  });
});

/** "지금 배포" 수동 트리거 — 콘솔 명령 실행과 같은 기준(DEVELOPER 이상) */
export const POST = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (!hasServerRank(await getServerRole(user, server), "DEVELOPER")) {
    return NextResponse.json({ error: "배포할 권한이 없어요." }, { status: 403 });
  }

  const result = await redeployFromGit(server, user.id, "MANUAL");
  return NextResponse.json(result);
});
