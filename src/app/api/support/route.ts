import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { sendDiscordDM } from "@/lib/discordNotify";
import { withApiErrorHandling } from "@/lib/apiHandler";

const schema = z.object({ message: z.string().min(1).max(2000) });

/** 내 문의 스레드(가장 최근 OPEN 건, 없으면 null)와 그 메시지 목록을 돌려준다 */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const thread = await prisma.supportThread.findFirst({
    where: { userId: user.id, status: "OPEN" },
    orderBy: { updatedAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  return NextResponse.json(thread);
}

/**
 * 대시보드에서 관리자에게 문의를 보낸다 — 전부 웹 안에서 이루어진다(디스코드 연동 불필요).
 * 열려있는 문의 스레드가 있으면 거기에 이어붙이고, 없으면 새로 만든다.
 * 관리자에게는 보조로 디스코드 DM을 보내지만(연동 안 돼 있으면 조용히 생략), 답장은
 * 반드시 관리자 페이지(웹)에서 하므로 고객 쪽 경험은 디스코드와 무관하다.
 */
export const POST = withApiErrorHandling(async (request: Request) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "문의 내용을 입력해주세요." }, { status: 422 });

  let thread = await prisma.supportThread.findFirst({
    where: { userId: user.id, status: "OPEN" },
  });
  if (!thread) {
    thread = await prisma.supportThread.create({ data: { userId: user.id } });
  }

  await prisma.supportMessage.create({
    data: { threadId: thread.id, senderRole: "USER", content: parsed.data.message },
  });
  await prisma.supportThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (admin) {
    const adminLink = await prisma.discordLink.findUnique({ where: { userId: admin.id } });
    if (adminLink) {
      await sendDiscordDM(
        adminLink.discordUserId,
        `📩 **${user.name}**(${user.email})님이 대시보드에서 문의를 보냈어요 — 관리자 페이지 > 고객지원에서 확인해주세요.`,
      ).catch(() => {});
    }
  }

  const updated = await prisma.supportThread.findUniqueOrThrow({
    where: { id: thread.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  return NextResponse.json(updated);
});
