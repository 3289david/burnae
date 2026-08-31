import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const templates = await prisma.serverTemplate.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json(templates);
}

const schema = z.object({
  key: z.string().min(1),
  displayName: z.string().min(1),
  category: z.enum(["MINECRAFT", "DISCORD_BOT", "GENERAL"]).default("MINECRAFT"),
  pterodactylNestId: z.number().int(),
  pterodactylEggId: z.number().int(),
  dockerImage: z.string().min(1),
  startupCommand: z.string().min(1),
  minecraftVersions: z.array(z.string()).default([]),
  defaultEnvironment: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  availableDockerImages: z.record(z.string(), z.string()).optional(),
  sortOrder: z.number().int().default(0),
})
  .refine((v) => v.category !== "MINECRAFT" || v.minecraftVersions.length > 0, {
    message: "마인크래프트 종류는 지원 버전을 1개 이상 입력해야 해요.",
    path: ["minecraftVersions"],
  });

/**
 * Pterodactyl 패널에 미리 등록된 Egg(예: Paper, Fabric, Forge)를 Burnae 상품 시스템에 연결한다.
 * eggId/nestId는 관리자가 Pterodactyl 패널의 Nests 화면에서 확인해 입력한다.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 422 });
  }

  const template = await prisma.serverTemplate.create({ data: parsed.data });
  return NextResponse.json(template);
}
