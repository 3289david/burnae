import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isValidDepositorName } from "@/lib/hanabank";
import { markOrderPaidAndFulfill } from "@/lib/orderFulfillment";

const schema = z.object({
  depositorName: z.string(),
  amountKrw: z.number().int().positive(),
});

/**
 * 하나은행 Open API는 실시간 웹훅이 없어서(hanabank.ts 주석 참고) 10분 주기 크론으로만
 * 입금을 확인했다. 이 엔드포인트는 입금 알림 안드로이드 앱(휴대폰에 뜨는 하나은행 앱 알림을
 * 그대로 읽어서 전달)에서 바로 호출해 몇 초 안에 매칭되게 한다 — 크론의 폴링 매칭과 똑같이
 * 입금자명+금액이 모두 일치해야만 주문을 체결한다(다른 용도로도 쓰는 계좌라 둘 다 맞아야 함).
 */
export async function POST(request: Request) {
  const secret = process.env.HANABANK_NOTIFY_SECRET;
  if (!secret) {
    console.error("[hanabank-notification] HANABANK_NOTIFY_SECRET 환경변수가 설정되지 않았습니다.");
    return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 });
  }

  const provided = request.headers.get("x-hanabank-notify-secret") ?? "";
  const expected = Buffer.from(secret);
  const actual = Buffer.from(provided);
  const match = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  if (!match) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  const { depositorName, amountKrw } = parsed.data;
  if (!isValidDepositorName(depositorName)) {
    return NextResponse.json({ matched: false, reason: "INVALID_DEPOSITOR_NAME" });
  }

  const order = await prisma.order.findFirst({ where: { depositorName, amountKrw, status: "PENDING" } });
  if (!order) {
    return NextResponse.json({ matched: false, reason: "NO_PENDING_ORDER" });
  }

  try {
    await markOrderPaidAndFulfill(order.id);
    await prisma.auditLog.create({
      data: {
        action: "HANABANK_PUSH_MATCHED",
        targetType: "Order",
        targetId: order.id,
        metadata: { depositorName, amountKrw },
      },
    });
    console.log(`[hanabank-notification] 입금 알림으로 주문 ${order.id} 즉시 체결 (${depositorName}, ${amountKrw}원)`);
    return NextResponse.json({ matched: true, orderId: order.id });
  } catch (err) {
    console.error(`[hanabank-notification] 주문 ${order.id} 체결 실패:`, err);
    return NextResponse.json({ error: "체결 처리 중 오류" }, { status: 500 });
  }
}
