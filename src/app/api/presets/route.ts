import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const MAX_ACTIVE_PRESETS_PER_USER = 20;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const templateId = searchParams.get("templateId");

  const presets = await prisma.userPreset.findMany({
    where: { baseTemplateId: templateId ?? undefined, delisted: false },
    orderBy: [{ useCount: "desc" }, { createdAt: "desc" }],
    take: templateId ? 30 : 100,
    select: {
      id: true,
      displayName: true,
      blurb: true,
      gitRepoUrl: true,
      createdAt: true,
      useCount: true,
      baseTemplateId: true,
      baseTemplate: { select: { displayName: true, category: true } },
      createdBy: { select: { id: true, name: true, role: true } },
    },
  });

  return NextResponse.json(
    presets.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      blurb: p.blurb,
      gitRepoUrl: p.gitRepoUrl,
      createdAt: p.createdAt,
      useCount: p.useCount,
      baseTemplateId: p.baseTemplateId,
      baseTemplateName: p.baseTemplate.displayName,
      baseTemplateCategory: p.baseTemplate.category,
      creatorName: p.createdBy.name,
      verified: p.createdBy.role === "ADMIN",
    }))
  );
}

const createPresetSchema = z.object({
  baseTemplateId: z.string(),
  displayName: z.string().trim().min(1).max(40),
  blurb: z.string().trim().max(200).optional(),
  gitRepoUrl: z.string().trim().url().max(300),
});

/**
 * 커뮤니티 프리셋 = "일반 런타임 + 내 깃허브 저장소" 조합. 음악봇처럼 egg 자체가 이미 완성된
 * 프로그램인 종류는 고를 수 없고, GIT_ADDRESS를 지원하는(직접 코드를 올려서 돌리는) 런타임
 * 종류만 베이스로 쓸 수 있다. 환경변수(봇 토큰 등)는 여기서 받지 않는다 — 이 프리셋으로 서버를
 * 만드는 사람이 주문 시점에 직접 입력한다(provisioning.ts의 customVariables로 처리).
 */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const parsed = createPresetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 422 });
  }

  const template = await prisma.serverTemplate.findFirst({
    where: { id: parsed.data.baseTemplateId, active: true },
  });
  if (!template) {
    return NextResponse.json({ error: "존재하지 않는 서버 종류입니다." }, { status: 404 });
  }
  const defaultEnv = template.defaultEnvironment as Record<string, unknown>;
  if (!("GIT_ADDRESS" in defaultEnv)) {
    return NextResponse.json({ error: "이 서버 종류는 깃허브 저장소를 지원하지 않아요. 일반 런타임(Node.js, Python 등)을 골라주세요." }, { status: 422 });
  }

  const activeCount = await prisma.userPreset.count({ where: { createdById: user.id, delisted: false } });
  if (activeCount >= MAX_ACTIVE_PRESETS_PER_USER) {
    return NextResponse.json({ error: `프리셋은 유저당 최대 ${MAX_ACTIVE_PRESETS_PER_USER}개까지 공개할 수 있어요.` }, { status: 422 });
  }

  const preset = await prisma.userPreset.create({
    data: {
      baseTemplateId: template.id,
      createdById: user.id,
      displayName: parsed.data.displayName,
      blurb: parsed.data.blurb || null,
      gitRepoUrl: parsed.data.gitRepoUrl,
    },
  });

  return NextResponse.json({ id: preset.id }, { status: 201 });
}
