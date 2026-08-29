import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { sendDiscordDM } from "@/lib/discordNotify";
import { withApiErrorHandling } from "@/lib/apiHandler";

const schema = z.object({ message: z.string().min(1).max(1500) });

export const POST = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const link = await prisma.discordLink.findUnique({ where: { userId: id } });
  if (!link) {
    return NextResponse.json({ error: "이 유저는 디스코드를 연동하지 않았어요." }, { status: 422 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "메시지를 입력해주세요." }, { status: 422 });

  const sent = await sendDiscordDM(link.discordUserId, parsed.data.message);
  if (!sent) return NextResponse.json({ error: "DM 전송에 실패했어요 (DM 차단 등)." }, { status: 502 });

  return NextResponse.json({ ok: true });
});
