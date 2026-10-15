import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const schema = z.object({ itemId: z.string() });

function randomCouponCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "SHOP-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  const item = await prisma.shopItem.findUnique({ where: { id: parsed.data.itemId, active: true } });
  if (!item) return NextResponse.json({ error: "존재하지 않는 상품입니다." }, { status: 404 });
  if (item.kind === "RAM_UPGRADE" || item.kind === "CPU_UPGRADE" || item.kind === "DISK_UPGRADE" || item.kind === "BACKUP_SLOT_UPGRADE") {
    return NextResponse.json({ error: "이 항목은 서버 개요 화면의 \"포인트로 증설하기\"에서 교환해주세요." }, { status: 422 });
  }
  if (item.kind === "EXTRA_PORT" || item.kind === "EXTRA_SUBDOMAIN") {
    return NextResponse.json({ error: "이 항목은 서버 개요 화면의 \"추가 포트/서브도메인 구매\"에서 교환해주세요." }, { status: 422 });
  }

  let result: { couponCode?: string };
  try {
    result = await prisma.$transaction(async (tx) => {
      // READ COMMITTED에서는 읽고-확인하고-쓰는 방식은 동시 요청 두 개가 똑같이 통과할 수 있다
      // (동시에 1000P 잔액을 각각 읽고, 둘 다 통과 판정 후 각각 깎음 → 잔액이 음수가 됨).
      // 조건이 걸린 update 하나로 "충분할 때만 깎기"를 원자적으로 만든다.
      const updated = await tx.user.updateMany({
        where: { id: user.id, promotionPoints: { gte: item.pointsCost } },
        data: { promotionPoints: { decrement: item.pointsCost } },
      });
      if (updated.count === 0) {
        throw new Error("포인트가 부족해요.");
      }

      let couponCode: string | undefined;
      if (item.kind === "AI_CREDITS") {
        await tx.user.update({
          where: { id: user.id },
          data: { aiCreditsRemaining: { increment: item.amount ?? 0 } },
        });
      } else if (item.kind === "DISCOUNT_COUPON") {
        couponCode = randomCouponCode();
        await tx.coupon.create({
          data: {
            code: couponCode,
            discountType: "PERCENT",
            discountValue: item.amount ?? 10,
            maxUses: 1,
          },
        });
      } else if (item.kind === "EXTRA_FREE_SLOT") {
        await tx.extraFreeSlotGrant.create({
          data: {
            userId: user.id,
            expiresAt: new Date(Date.now() + (item.durationDays ?? 1) * 24 * 60 * 60 * 1000),
          },
        });
      }

      await tx.shopRedemption.create({
        data: { userId: user.id, itemId: item.id, pointsSpent: item.pointsCost },
      });

      return { couponCode };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "교환에 실패했어요.";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  return NextResponse.json({ ok: true, kind: item.kind, couponCode: result.couponCode });
}
