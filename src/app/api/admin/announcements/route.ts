import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { getBotSettings } from "@/lib/botSettings";
import { sendDiscordChannelMessage } from "@/lib/discordNotify";

const LEVEL_COLOR = { INFO: 0x3b82f6, WARNING: 0xf59e0b, CRITICAL: 0xef4444 } as const;

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const announcements = await prisma.announcement.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(announcements);
}

const schema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(1000),
  level: z.enum(["INFO", "WARNING", "CRITICAL"]).default("INFO"),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
});

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." }, { status: 422 });
  }
  const { startsAt, endsAt, ...rest } = parsed.data;

  const announcement = await prisma.announcement.create({
    data: {
      ...rest,
      startsAt: startsAt ? new Date(startsAt) : null,
      endsAt: endsAt ? new Date(endsAt) : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "ANNOUNCEMENT_CREATED",
      targetType: "Announcement",
      targetId: announcement.id,
      metadata: { title: announcement.title },
    },
  });

  getBotSettings()
    .then((settings) => {
      if (!settings?.announcementChannelId) return;
      return sendDiscordChannelMessage(settings.announcementChannelId, {
        embeds: [
          {
            title: `📢 ${announcement.title}`,
            description: announcement.body,
            color: LEVEL_COLOR[announcement.level],
          },
        ],
      });
    })
    .catch((err) => console.error("[announcements] 디스코드 알림 실패:", err));

  return NextResponse.json(announcement);
}
