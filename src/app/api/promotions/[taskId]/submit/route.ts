import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import {
  awardPoints,
  checkDiscordMembership,
  checkServerMotdBranded,
  submitForManualReview,
  verifyUrlContainsText,
} from "@/lib/promotions";

const schema = z.object({
  url: z.string().optional(),
  serverId: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { taskId } = await params;
  const task = await prisma.promotionTask.findUnique({ where: { id: taskId } });
  if (!task || !task.active) {
    return NextResponse.json({ error: "존재하지 않는 홍보 방법이에요." }, { status: 404 });
  }

  if (!task.repeatable) {
    const existing = await prisma.promotionCompletion.findFirst({
      where: { taskId, userId: user.id, status: { in: ["APPROVED", "PENDING_REVIEW"] } },
    });
    if (existing) {
      return NextResponse.json({ error: "이미 완료했거나 심사 중인 항목이에요." }, { status: 409 });
    }
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 422 });
  }
  const input = parsed.data;

  try {
    switch (task.verifyMethod) {
      case "URL_CONTAINS_LINK": {
        if (!input.url) return NextResponse.json({ error: "URL을 입력해주세요." }, { status: 422 });
        const ok = await verifyUrlContainsText(input.url, task.requiredText ?? "burnae.kr");
        if (!ok) {
          return NextResponse.json(
            { error: `제출한 페이지에서 "${task.requiredText ?? "burnae.kr"}" 문구를 찾지 못했어요.` },
            { status: 422 },
          );
        }
        const completion = await awardPoints({
          userId: user.id,
          taskId: task.id,
          pointsAwarded: task.pointsAwarded,
          proofUrl: input.url,
        });
        return NextResponse.json({ status: "APPROVED", pointsAwarded: completion.pointsAwarded });
      }

      case "SERVER_MOTD_BRANDED": {
        if (!input.serverId) return NextResponse.json({ error: "서버를 선택해주세요." }, { status: 422 });
        const server = await prisma.server.findFirst({
          where: { id: input.serverId, ownerId: user.id, deletedAt: null },
        });
        if (!server?.pterodactylIdentifier) {
          return NextResponse.json({ error: "서버를 찾을 수 없어요." }, { status: 404 });
        }
        const ok = await checkServerMotdBranded(server.pterodactylIdentifier, task.requiredText ?? "burnae.kr");
        if (!ok) {
          return NextResponse.json(
            { error: "서버 접속 안내문(MOTD)에서 문구를 찾지 못했어요. server.properties의 motd를 확인해주세요." },
            { status: 422 },
          );
        }
        const completion = await awardPoints({
          userId: user.id,
          taskId: task.id,
          pointsAwarded: task.pointsAwarded,
          relatedUserId: server.id,
        });
        return NextResponse.json({ status: "APPROVED", pointsAwarded: completion.pointsAwarded });
      }

      case "DISCORD_MEMBER": {
        const link = await prisma.discordLink.findUnique({ where: { userId: user.id } });
        if (!link) {
          return NextResponse.json({ error: "먼저 계정에서 디스코드를 연동해주세요." }, { status: 422 });
        }
        const ok = await checkDiscordMembership(link.discordUserId);
        if (!ok) {
          return NextResponse.json({ error: "공식 디스코드 서버에서 확인되지 않았어요." }, { status: 422 });
        }
        const completion = await awardPoints({
          userId: user.id,
          taskId: task.id,
          pointsAwarded: task.pointsAwarded,
        });
        return NextResponse.json({ status: "APPROVED", pointsAwarded: completion.pointsAwarded });
      }

      case "MANUAL_REVIEW": {
        if (!input.url) return NextResponse.json({ error: "증빙 URL을 입력해주세요." }, { status: 422 });
        await submitForManualReview({
          userId: user.id,
          taskId: task.id,
          pointsAwarded: task.pointsAwarded,
          proofUrl: input.url,
        });
        return NextResponse.json({ status: "PENDING_REVIEW" });
      }

      case "REFERRAL_SIGNUP":
      case "REFERRAL_FIRST_PAYMENT":
        return NextResponse.json(
          { error: "이 항목은 추천 링크로 가입/결제가 일어나면 자동으로 지급돼요." },
          { status: 422 },
        );

      default:
        return NextResponse.json({ error: "지원하지 않는 방식이에요." }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "확인 중 오류가 발생했어요.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
