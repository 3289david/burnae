import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";

const schema = z.object({
  autoBackupEnabled: z.boolean().optional(),
  autoBackupIntervalHours: z.number().int().min(1).max(168).optional(),
  autoRestartEnabled: z.boolean().optional(),
  autoRestartHour: z.number().int().min(0).max(23).nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (server.ownerId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "서버 소유자만 변경할 수 있어요." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  const updated = await prisma.server.update({ where: { id }, data: parsed.data });
  return NextResponse.json({
    autoBackupEnabled: updated.autoBackupEnabled,
    autoBackupIntervalHours: updated.autoBackupIntervalHours,
    autoRestartEnabled: updated.autoRestartEnabled,
    autoRestartHour: updated.autoRestartHour,
  });
}
