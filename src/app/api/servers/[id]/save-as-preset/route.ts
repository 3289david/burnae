import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { PteroClient } from "@/lib/pterodactyl";
import { SECRET_ENV_KEYS } from "@/lib/provisioning";
import { rewardCustomPresetPublished } from "@/lib/promotions";
import { withApiErrorHandling } from "@/lib/apiHandler";

const MAX_ACTIVE_PRESETS_PER_USER = 20;

const schema = z.object({
  displayName: z.string().trim().min(1).max(40),
  blurb: z.string().trim().max(200).optional(),
});

/** 지금 이 서버가 쓰고 있는 시작 변수 값 그대로를 커뮤니티 프리셋으로 공개해서, 나중에 같은 설정으로
 * 빠르게 새 서버를 만들 수 있게 한다. 접속 비밀번호류 값은 절대 노출되지 않는다. */
export const POST = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (server.ownerId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "서버 소유자만 프리셋으로 저장할 수 있어요." }, { status: 403 });
  }
  if (!server.pterodactylIdentifier) {
    return NextResponse.json({ error: "서버가 아직 준비 중입니다." }, { status: 409 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 422 });

  const activeCount = await prisma.userPreset.count({ where: { createdById: user.id, delisted: false } });
  if (activeCount >= MAX_ACTIVE_PRESETS_PER_USER) {
    return NextResponse.json({ error: `프리셋은 유저당 최대 ${MAX_ACTIVE_PRESETS_PER_USER}개까지 공개할 수 있어요.` }, { status: 422 });
  }

  const template = await prisma.serverTemplate.findUnique({ where: { id: server.templateId } });
  if (!template) return NextResponse.json({ error: "서버 종류를 찾을 수 없습니다." }, { status: 404 });

  const defaultEnv = template.defaultEnvironment as Record<string, unknown>;
  const allowedKeys = new Set(Object.keys(defaultEnv).filter((k) => !SECRET_ENV_KEYS.includes(k)));

  const variables = await PteroClient.getStartupVariables(server.pterodactylIdentifier);
  const environment: Record<string, string> = {};
  for (const v of variables) {
    if (allowedKeys.has(v.envVariable)) environment[v.envVariable] = v.serverValue;
  }

  const preset = await prisma.userPreset.create({
    data: {
      baseTemplateId: template.id,
      createdById: user.id,
      displayName: parsed.data.displayName,
      blurb: parsed.data.blurb || null,
      environment,
    },
  });

  const reward = await rewardCustomPresetPublished(user.id, preset.id);

  return NextResponse.json({ id: preset.id, pointsAwarded: reward?.pointsAwarded ?? 0 }, { status: 201 });
});
