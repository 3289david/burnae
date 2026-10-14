import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/auth";
import { sendDiscordDM } from "@/lib/discordNotify";
import { withApiErrorHandling } from "@/lib/apiHandler";

const schema = z.object({ message: z.string().min(1).max(2000) });

/** 관리자가 웹에서 답장을 보낸다 — 고객에게는 보조로 디스코드 DM만 보내고(연동 안 돼 있으면 생략),
 * 실제 답변 내용은 항상 대시보드(웹)에서 확인하게 한다 */
export const POST = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const admin = await requireAdminRole(["COMMUNITY", "SUPER"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const thread = await prisma.supportThread.findUnique({ where: { id } });
  if (!thread) return NextResponse.json({ error: "스레드를 찾을 수 없습니다." }, { status: 404 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "답장 내용을 입력해주세요." }, { status: 422 });

  await prisma.supportMessage.create({
    data: { threadId: id, senderRole: "ADMIN", content: parsed.data.message },
  });
  const updated = await prisma.supportThread.update({
    where: { id },
    data: { updatedAt: new Date() },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  const customerLink = await prisma.discordLink.findUnique({ where: { userId: thread.userId } });
  if (customerLink) {
    await sendDiscordDM(customerLink.discordUserId, "📨 문의에 답장이 왔어요 — 대시보드 > 계정 페이지에서 확인해주세요.").catch(() => {});
  }

  return NextResponse.json(updated);
});
