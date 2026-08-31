import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { SECRET_ENV_KEYS } from "@/lib/provisioning";
import { rewardCustomPresetPublished } from "@/lib/promotions";

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
      environment: true,
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
      environment: p.environment,
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
  environment: z.record(z.string(), z.union([z.string().max(500), z.number(), z.boolean()])),
});

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

  const activeCount = await prisma.userPreset.count({ where: { createdById: user.id, delisted: false } });
  if (activeCount >= MAX_ACTIVE_PRESETS_PER_USER) {
    return NextResponse.json({ error: `프리셋은 유저당 최대 ${MAX_ACTIVE_PRESETS_PER_USER}개까지 공개할 수 있어요.` }, { status: 422 });
  }

  // egg가 이미 갖고 있는 환경변수 키의 "값"만 덮어쓸 수 있다 — 새 키를 추가하거나 접속
  // 비밀번호류 키(egg가 서버 생성 시 매번 무작위로 새로 채우는 값)를 지정하는 건 금지한다.
  const defaultEnv = template.defaultEnvironment as Record<string, unknown>;
  const allowedKeys = new Set(Object.keys(defaultEnv).filter((k) => !SECRET_ENV_KEYS.includes(k)));
  const environment: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(parsed.data.environment)) {
    if (!allowedKeys.has(key)) {
      return NextResponse.json({ error: `"${key}"는 이 서버 종류에서 설정할 수 없는 값이에요.` }, { status: 422 });
    }
    environment[key] = value;
  }
  if (Object.keys(environment).length === 0) {
    return NextResponse.json({ error: "설정값이 비어있어요." }, { status: 422 });
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
}
