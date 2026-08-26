import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { syncRulesMessage, syncLinktreeMessage } from "@/lib/discordBoards";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const settings = await prisma.botSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  return NextResponse.json(settings);
}

const schema = z.object({
  verifiedRoleId: z.string().min(1).optional().nullable(),
  purchaserRoleId: z.string().min(1).optional().nullable(),
  subscriberRoleId: z.string().min(1).optional().nullable(),
  rulesTitle: z.string().min(1).max(100).optional(),
  rulesContent: z.string().max(3800).optional(),
  rulesChannelId: z.string().min(1).optional().nullable(),
  linktreeTitle: z.string().min(1).max(100).optional(),
  linktreeChannelId: z.string().min(1).optional().nullable(),
  statusBoardChannelId: z.string().min(1).optional().nullable(),
  announcementChannelId: z.string().min(1).optional().nullable(),
  logChannelId: z.string().min(1).optional().nullable(),
});

export async function PUT(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." }, { status: 422 });
  }

  const updated = await prisma.botSettings.upsert({
    where: { id: 1 },
    update: parsed.data,
    create: { id: 1, ...parsed.data },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "BOT_SETTINGS_UPDATED",
      targetType: "BotSettings",
      targetId: "1",
      metadata: parsed.data,
    },
  });

  // 규칙/링크트리 내용이나 채널이 바뀌었을 수 있으니 디스코드 메시지를 최신 상태로 다시 맞춘다
  await Promise.allSettled([syncRulesMessage(), syncLinktreeMessage()]);

  return NextResponse.json(updated);
}
