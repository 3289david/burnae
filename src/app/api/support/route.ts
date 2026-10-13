import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { sendDiscordDM, createPrivateThreadWithMember } from "@/lib/discordNotify";
import { getBotSettings } from "@/lib/botSettings";
import { withApiErrorHandling } from "@/lib/apiHandler";

const schema = z.object({ message: z.string().min(1).max(2000) });

/**
 * 대시보드에서 바로 관리자에게 문의를 보낸다 — 디스코드 /문의 명령어와 같은 방식(1:1 비공개
 * 스레드)으로 열리고, 이후 대화는 디스코드에서 이어간다(웹 안에 별도 채팅 UI를 만들지 않음).
 * 디스코드 연동이 안 된 유저는 열 수 없다 — 상담 채널 자체가 디스코드 기반이라서.
 */
export const POST = withApiErrorHandling(async (request: Request) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "문의 내용을 입력해주세요." }, { status: 422 });

  const link = await prisma.discordLink.findUnique({ where: { userId: user.id } });
  if (!link) {
    return NextResponse.json(
      { error: "먼저 디스코드 계정을 연동해주세요 — 상담은 디스코드 비공개 채널로 진행돼요.", code: "DISCORD_NOT_LINKED" },
      { status: 409 },
    );
  }

  const settings = await getBotSettings();
  if (!settings?.logChannelId) {
    return NextResponse.json({ error: "지금은 문의를 받을 수 없어요. 디스코드 /문의 명령어를 이용해주세요." }, { status: 503 });
  }

  const threadId = await createPrivateThreadWithMember(
    settings.logChannelId,
    `문의-${user.name}`,
    link.discordUserId,
    `**${user.name}**님이 대시보드에서 문의를 보냈어요:\n> ${parsed.data.message}`,
  );
  if (!threadId) {
    return NextResponse.json({ error: "문의 채널 개설에 실패했어요. 잠시 후 다시 시도해주세요." }, { status: 502 });
  }

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (admin) {
    const adminLink = await prisma.discordLink.findUnique({ where: { userId: admin.id } });
    if (adminLink) {
      await sendDiscordDM(
        adminLink.discordUserId,
        `📩 **${user.name}**(${user.email})님이 대시보드에서 문의를 보냈어요 — 디스코드에 열린 비공개 채널을 확인해주세요.`,
      ).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
});
