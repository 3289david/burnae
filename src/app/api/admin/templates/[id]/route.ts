import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const schema = z.object({
  displayName: z.string().min(1).optional(),
  category: z.enum(["MINECRAFT", "VPS", "DISCORD_BOT", "GENERAL"]).optional(),
  dockerImage: z.string().min(1).optional(),
  startupCommand: z.string().min(1).optional(),
  minecraftVersions: z.array(z.string()).optional(),
  defaultEnvironment: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
  availableDockerImages: z.record(z.string(), z.string()).nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 422 });
  }

  const { availableDockerImages, ...rest } = parsed.data;
  const template = await prisma.serverTemplate.update({
    where: { id },
    data: {
      ...rest,
      ...(availableDockerImages !== undefined
        ? { availableDockerImages: availableDockerImages === null ? Prisma.JsonNull : availableDockerImages }
        : {}),
    },
  });
  return NextResponse.json(template);
}
