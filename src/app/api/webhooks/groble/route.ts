import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { markOrderPaidAndFulfill } from "@/lib/orderFulfillment";

/**
 * groble.im 결제 웹훅. 고정 가격 플랜(Product.grobleProductUrl이 설정된 상품)만 연동 대상 —
 * 포인트/AI크레딧처럼 금액이 매번 다른 주문은 groble의 "고정가 상품" 구조와 안 맞아서 기존
 * 무통장입금/코인 결제로만 받는다.
 *
 * groble은 결제창 완료 후 리다이렉트 URL에 주문 식별 정보를 전혀 안 실어준다(이동 페이지 설정에
 * query param 없음, 문서 확인함) — 그래서 주문 체결은 전부 이 웹훅(서버-서버)에만 의존한다.
 * 결제 링크에 ?ref=<Order.id>를 붙여서 보내면 웹훅 payload의 data.object.sellerReference로
 * 그대로 돌아온다 — 이게 유일한 주문 매칭 수단.
 *
 * 서명 검증: https://www.groble.im/help/guides/webhook
 *   signature = HEX(HMAC-SHA256(secret, `${timestamp}.${rawBody}`))
 *   헤더: X-Groble-Signature, X-Groble-Timestamp (둘 다 필수)
 *   타임스탬프는 원본 바이트 기준으로 ±5분 이내여야 함, 원문(raw body)으로 검증해야 함(파싱 전).
 */
const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

function verifySignature(rawBody: string, timestamp: string, signature: string): boolean {
  const secret = process.env.GROBLE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[groble-webhook] GROBLE_WEBHOOK_SECRET 환경변수가 설정되지 않았습니다.");
    return false;
  }
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

interface GrobleWebhookPayload {
  id: string;
  type: string;
  occurredAt: string;
  data: {
    object: {
      merchantUid?: string;
      sellerReference?: string;
      content?: { id?: string };
      pricing?: { currency?: string; finalAmount?: number };
    };
  };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-groble-timestamp") ?? "";
  const signature = request.headers.get("x-groble-signature") ?? "";

  if (!timestamp || !signature) {
    return NextResponse.json({ error: "서명 헤더 누락" }, { status: 401 });
  }

  const now = Math.floor(Date.now() / 1000);
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > TIMESTAMP_TOLERANCE_SECONDS) {
    return NextResponse.json({ error: "타임스탬프 유효기간 초과" }, { status: 401 });
  }

  if (!verifySignature(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: "서명 검증 실패" }, { status: 401 });
  }

  let payload: GrobleWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }

  // payment.completed 외 이벤트(취소/환불 등)는 일단 2xx로 확인만 하고 넘어간다 — 재시도
  // 폭주를 막기 위해(최대 7회 재시도, 최종 410 아니면 끝없이 다시 옴) 모든 이벤트에 빠르게
  // 응답해야 하고, 취소/환불 처리는 아직 수동(관리자가 직접 확인 후 처리)으로 둔다.
  if (payload.type !== "payment.completed") {
    console.log(`[groble-webhook] ${payload.type} 이벤트 수신(처리 안 함, 확인만)`);
    return NextResponse.json({ ok: true });
  }

  const obj = payload.data?.object;
  const orderId = obj?.sellerReference;
  if (!orderId) {
    console.error("[groble-webhook] payment.completed인데 sellerReference(ref)가 없음:", payload.id);
    return NextResponse.json({ error: "sellerReference 누락" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { product: true } });
  if (!order) {
    console.error(`[groble-webhook] 주문 ${orderId}를 찾을 수 없음 (evt: ${payload.id})`);
    return NextResponse.json({ error: "주문을 찾을 수 없음" }, { status: 404 });
  }

  // 다른 상품 결제가 실수로(또는 조작으로) 엉뚱한 주문에 매칭되지 않도록 금액과 상품을 모두
  // 확인한다 — sellerReference만 믿고 바로 체결하면 금액이 다른 groble 결제도 통과해버릴 수 있음
  const finalAmount = obj?.pricing?.finalAmount;
  const currency = obj?.pricing?.currency;
  if (currency !== "KRW" || finalAmount !== order.amountKrw) {
    console.error(
      `[groble-webhook] 주문 ${orderId} 금액 불일치 (기대 ${order.amountKrw}원, 실제 ${finalAmount}${currency}) — 체결 안 함`,
    );
    return NextResponse.json({ error: "금액 불일치" }, { status: 400 });
  }
  if (order.product?.grobleContentId && obj?.content?.id && obj.content.id !== order.product.grobleContentId) {
    console.error(`[groble-webhook] 주문 ${orderId} 상품 불일치 (content.id=${obj.content.id}) — 체결 안 함`);
    return NextResponse.json({ error: "상품 불일치" }, { status: 400 });
  }

  try {
    await markOrderPaidAndFulfill(order.id);
    await prisma.auditLog.create({
      data: {
        action: "GROBLE_PAYMENT_COMPLETED",
        targetType: "Order",
        targetId: order.id,
        metadata: { eventId: payload.id, merchantUid: obj?.merchantUid, finalAmount },
      },
    });
    console.log(`[groble-webhook] 주문 ${order.id} 체결 완료 (evt: ${payload.id})`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[groble-webhook] 주문 ${order.id} 체결 처리 실패:`, err);
    return NextResponse.json({ error: "체결 처리 중 오류" }, { status: 500 });
  }
}
