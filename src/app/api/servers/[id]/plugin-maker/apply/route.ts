import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { applyPluginMakerResult, PluginUnsafeError } from "@/lib/ai/pluginMakerApply";
import { PluginCompileError } from "@/lib/ai/pluginCompiler";
import { isBukkitFamilyTemplate, type PluginMakerResult } from "@/lib/ai/pluginMaker";

const schema = z.object({
  kind: z.enum(["skript", "datapack", "java_plugin"]),
  summary: z.string(),
  warnings: z.array(z.string()).default([]),
  skript: z.object({ filename: z.string().min(1), content: z.string().min(1) }).optional(),
  datapack: z
    .object({
      namespace: z.string().regex(/^[a-z0-9_]+$/, "namespace는 영문 소문자/숫자/언더스코어만 가능해요."),
      functions: z
        .array(z.object({ name: z.string().regex(/^[a-z0-9_]+$/), commands: z.array(z.string()).min(1) }))
        .min(1),
      runOnLoad: z.array(z.string()).optional(),
      runEveryTick: z.array(z.string()).optional(),
    })
    .optional(),
  javaPlugin: z
    .object({
      packageName: z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/, "패키지명이 올바르지 않아요."),
      className: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/, "클래스명이 올바르지 않아요."),
      javaSource: z.string().min(1),
      pluginYml: z.string().min(1),
    })
    .optional(),
});

/** 사용자가 미리보기를 확인한 뒤 실제로 서버에 적용한다 (컴파일/파일 작성 + 리로드 또는 재시작) */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (!server.pterodactylIdentifier) {
    return NextResponse.json({ error: "서버가 아직 준비 중입니다." }, { status: 409 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." }, { status: 422 });
  }
  if (parsed.data.kind === "skript" && !parsed.data.skript) {
    return NextResponse.json({ error: "스크립트 내용이 없어요." }, { status: 422 });
  }
  if (parsed.data.kind === "datapack" && !parsed.data.datapack) {
    return NextResponse.json({ error: "데이터팩 내용이 없어요." }, { status: 422 });
  }
  if (parsed.data.kind === "java_plugin" && !parsed.data.javaPlugin) {
    return NextResponse.json({ error: "플러그인 내용이 없어요." }, { status: 422 });
  }

  if (parsed.data.kind !== "datapack") {
    const template = await prisma.serverTemplate.findUniqueOrThrow({ where: { id: server.templateId } });
    if (!isBukkitFamilyTemplate(template.key)) {
      return NextResponse.json(
        { error: "이 서버 종류에서는 데이터팩만 적용할 수 있어요." },
        { status: 422 },
      );
    }
  }

  try {
    const { appliedPath } = await applyPluginMakerResult(
      server.pterodactylIdentifier,
      server.minecraftVersion,
      parsed.data as PluginMakerResult,
    );

    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "PLUGIN_MAKER_APPLIED",
        targetType: "Server",
        targetId: server.id,
        metadata: { kind: parsed.data.kind, summary: parsed.data.summary, appliedPath },
      },
    });

    return NextResponse.json({ ok: true, appliedPath });
  } catch (err) {
    if (err instanceof PluginUnsafeError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    if (err instanceof PluginCompileError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("[plugin-maker apply] 실패:", err);
    return NextResponse.json({ error: "서버에 적용하지 못했어요." }, { status: 502 });
  }
}
