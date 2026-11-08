import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/auth";

export async function GET() {
  const admin = await requireAdminRole(["COMMUNITY", "GENERAL", "SUPER"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const items = await prisma.levelRole.findMany({ orderBy: { level: "asc" } });
  return NextResponse.json(items);
}

const schema = z.object({
  level: z.number().int().min(1),
  discordRoleId: z.string().min(1),
  name: z.string().min(1).max(80),
});

export async function POST(request: Request) {
  const admin = await requireAdminRole(["GENERAL", "SUPER"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." }, { status: 422 });
  }

  const item = await prisma.levelRole.create({ data: parsed.data });

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "LEVEL_ROLE_CREATED",
      targetType: "LevelRole",
      targetId: item.id,
      metadata: { level: item.level, discordRoleId: item.discordRoleId, name: item.name },
    },
  });

  return NextResponse.json(item);
}
