import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { markOrderPaidAndFulfill } from "@/lib/orderFulfillment";
import { sendDiscordDM } from "@/lib/discordNotify";

/**
 * groble.im 정기결제(구독형) 웹훅. burnae의 월정액 플랜과 맞춰서 "고정가 플랜 = groble 구독
 * 상품"으로 연동한다(1회성 payment.completed가 아니라 subscription_payment.* 이벤트 기준).
 *
 * 구독 식별 방법(groble 문서 확인함): sellerReference는 최초 결제~이후 모든 회차 갱신까지
 * 동일하게 유지된다. 그래서 결제 링크에 ?ref=<최초 Order.id>를 붙여두면:
 *   - 1회차(billingReason=INITIAL): sellerReference로 그 Order를 바로 찾아 체결한다.
 *   - 2회차 이후(billingReason=RENEWAL): 그 Order.id는 이미 PAID라서 재사용할 수 없으니,
 *     Order.grobleSellerReference(최초 주문에만 심어둔 값)로 역추적해 serverId/productId를
 *     알아낸 뒤, 그 회차용 새 RENEWAL Order를 즉석에서 만들어서 체결한다.
 * merchantUid는 회차마다 새로 발급되므로 Order.grobleMerchantUid에 유니크로 저장해 웹훅
 * 재시도(최대 7회/44시간)로 같은 회차가 중복 체결되는 걸 막는다.
 *
 * 서명 검증: https://www.groble.im/help/guides/webhook
 *   signature = HEX(HMAC-SHA256(secret, `${timestamp}.${rawBody}`))
 *   헤더: X-Groble-Signature, X-Groble-Timestamp (둘 다 필수), ±5분 이내, raw body 기준 검증.
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
      subscription?: {
        billingReason?: "INITIAL" | "RENEWAL";
        nextBillingDate?: string;
        status?: string;
        currentRound?: number;
      };
      failure?: {
        attemptNumber?: number;
        isFinal?: boolean;
        reason?: string;
        nextRetryAt?: string;
        gracePeriodEndsAt?: string;
      };
      termination?: { reason?: string };
      cancelledBy?: string;
    };
  };
}

async function notifyOwner(userId: string, message: string) {
  const link = await prisma.discordLink.findUnique({ where: { userId } });
  if (link) await sendDiscordDM(link.discordUserId, message).catch(() => {});
}

/** sellerReference는 구독 전체에서 동일하므로, 최초 주문을 통해 그 구독이 물린 서버를 찾는다. */
async function findServerBySellerReference(sellerReference: string) {
  const initialOrder = await prisma.order.findUnique({
    where: { grobleSellerReference: sellerReference },
  });
  if (!initialOrder?.serverId) return null;
  return prisma.server.findUnique({ where: { id: initialOrder.serverId } });
}

async function handleInitialPayment(
  payload: GrobleWebhookPayload,
  obj: GrobleWebhookPayload["data"]["object"],
) {
  const orderId = obj.sellerReference;
  if (!orderId) {
    console.error("[groble-webhook] INITIAL인데 sellerReference(ref)가 없음:", payload.id);
    return NextResponse.json({ error: "sellerReference 누락" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { product: true } });
  if (!order) {
    console.error(`[groble-webhook] 주문 ${orderId}를 찾을 수 없음 (evt: ${payload.id})`);
    return NextResponse.json({ error: "주문을 찾을 수 없음" }, { status: 404 });
  }

  const finalAmount = obj.pricing?.finalAmount;
  const currency = obj.pricing?.currency;
  if (currency !== "KRW" || finalAmount !== order.amountKrw) {
    console.error(
      `[groble-webhook] 주문 ${orderId} 금액 불일치 (기대 ${order.amountKrw}원, 실제 ${finalAmount}${currency}) — 체결 안 함`,
    );
    return NextResponse.json({ error: "금액 불일치" }, { status: 400 });
  }
  if (order.product?.grobleContentId && obj.content?.id && obj.content.id !== order.product.grobleContentId) {
    console.error(`[groble-webhook] 주문 ${orderId} 상품 불일치 (content.id=${obj.content.id}) — 체결 안 함`);
    return NextResponse.json({ error: "상품 불일치" }, { status: 400 });
  }

  try {
    // sellerReference를 이 주문에 영구히 심어둔다 — 이후 회차들이 이걸로 역추적해온다.
    // 이미 다른 주문에 쓰인 적 있으면(재시도로 같은 ref가 다시 들어온 경우 포함) 유니크
    // 제약이 그대로 막아주고, update 자체는 같은 값으로 다시 써도 안전(멱등)하다.
    await prisma.order.update({
      where: { id: order.id },
      data: { grobleSellerReference: orderId, grobleMerchantUid: obj.merchantUid },
    }).catch((err) => {
      // 유니크 제약 충돌 = 이미 다른 주문이 이 ref를 선점(중복 웹훅) — 체결 자체는 markOrderPaidAndFulfill의
      // 멱등 처리에 맡기고 여기선 로그만 남긴다.
      console.warn(`[groble-webhook] 주문 ${orderId} sellerReference/merchantUid 기록 실패(중복 웹훅 가능):`, err);
    });

    await markOrderPaidAndFulfill(order.id);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    if (updated?.serverId && obj.subscription) {
      await prisma.server.update({
        where: { id: updated.serverId },
        data: {
          grobleSubscriptionStatus: "ACTIVE",
          grobleNextBillingDate: obj.subscription.nextBillingDate ? new Date(obj.subscription.nextBillingDate) : null,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        action: "GROBLE_SUBSCRIPTION_INITIAL_PAYMENT",
        targetType: "Order",
        targetId: order.id,
        metadata: { eventId: payload.id, merchantUid: obj.merchantUid, finalAmount },
      },
    });
    console.log(`[groble-webhook] 구독 최초 결제 — 주문 ${order.id} 체결 완료 (evt: ${payload.id})`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[groble-webhook] 주문 ${order.id} 최초 결제 체결 실패:`, err);
    return NextResponse.json({ error: "체결 처리 중 오류" }, { status: 500 });
  }
}

async function handleRenewalPayment(
  payload: GrobleWebhookPayload,
  obj: GrobleWebhookPayload["data"]["object"],
) {
  const sellerReference = obj.sellerReference;
  const merchantUid = obj.merchantUid;
  if (!sellerReference || !merchantUid) {
    console.error("[groble-webhook] RENEWAL인데 sellerReference/merchantUid가 없음:", payload.id);
    return NextResponse.json({ error: "필수 필드 누락" }, { status: 400 });
  }

  // 같은 회차가 재시도로 중복 전송된 경우 — 이미 처리됐으니 그냥 확인만 해준다.
  const alreadyProcessed = await prisma.order.findUnique({ where: { grobleMerchantUid: merchantUid } });
  if (alreadyProcessed) {
    console.log(`[groble-webhook] merchantUid ${merchantUid} 이미 처리됨 — 중복 웹훅 확인만`);
    return NextResponse.json({ ok: true });
  }

  const initialOrder = await prisma.order.findUnique({
    where: { grobleSellerReference: sellerReference },
    include: { product: true },
  });
  if (!initialOrder?.serverId) {
    console.error(`[groble-webhook] sellerReference ${sellerReference}에 연결된 서버를 못 찾음 (evt: ${payload.id})`);
    return NextResponse.json({ error: "구독에 연결된 서버를 찾을 수 없음" }, { status: 404 });
  }

  const server = await prisma.server.findUnique({ where: { id: initialOrder.serverId } });
  if (!server) {
    console.error(`[groble-webhook] 서버 ${initialOrder.serverId}가 존재하지 않음 (evt: ${payload.id})`);
    return NextResponse.json({ error: "서버를 찾을 수 없음" }, { status: 404 });
  }

  // 갱신 시점의 "현재" 월정액과 비교한다(업그레이드로 가격이 바뀌었을 수 있어 최초 결제액이 아님)
  const expectedAmount = server.priceMonthlyKrwSnapshot ?? initialOrder.product?.priceMonthlyKrw ?? initialOrder.amountKrw;
  const finalAmount = obj.pricing?.finalAmount;
  const currency = obj.pricing?.currency;
  if (currency !== "KRW" || finalAmount !== expectedAmount) {
    console.error(
      `[groble-webhook] 서버 ${server.id} 갱신 금액 불일치 (기대 ${expectedAmount}원, 실제 ${finalAmount}${currency}) — 체결 안 함`,
    );
    return NextResponse.json({ error: "금액 불일치" }, { status: 400 });
  }
  if (initialOrder.product?.grobleContentId && obj.content?.id && obj.content.id !== initialOrder.product.grobleContentId) {
    console.error(`[groble-webhook] 서버 ${server.id} 갱신 상품 불일치 (content.id=${obj.content.id}) — 체결 안 함`);
    return NextResponse.json({ error: "상품 불일치" }, { status: 400 });
  }

  try {
    // depositorName은 은행 입금 자동매칭에도 쓰이는 컬럼이라 NOT NULL인데, groble 자동결제 주문은
    // 그 매칭 대상이 아니므로 "CRYPTO-xxxx"(코인 결제)와 같은 패턴으로 절대 안 겹치게 채운다.
    const renewalOrder = await prisma.order.create({
      data: {
        userId: server.ownerId,
        productId: initialOrder.productId,
        productNameSnapshot: server.productNameSnapshot,
        type: "RENEWAL",
        serverId: server.id,
        status: "PENDING",
        amountKrw: finalAmount,
        depositorName: `GROBLE-${merchantUid.slice(0, 12)}`,
        grobleMerchantUid: merchantUid,
      },
    });

    await markOrderPaidAndFulfill(renewalOrder.id);

    await prisma.server.update({
      where: { id: server.id },
      data: {
        grobleSubscriptionStatus: "ACTIVE",
        grobleNextBillingDate: obj.subscription?.nextBillingDate ? new Date(obj.subscription.nextBillingDate) : null,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "GROBLE_SUBSCRIPTION_RENEWAL_PAYMENT",
        targetType: "Server",
        targetId: server.id,
        metadata: { eventId: payload.id, merchantUid, orderId: renewalOrder.id, finalAmount, round: obj.subscription?.currentRound },
      },
    });
    console.log(`[groble-webhook] 구독 갱신 — 서버 ${server.id} 주문 ${renewalOrder.id} 체결 완료 (evt: ${payload.id})`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[groble-webhook] 서버 ${server.id} 갱신 체결 실패:`, err);
    return NextResponse.json({ error: "체결 처리 중 오류" }, { status: 500 });
  }
}

async function handleSubscriptionFailed(payload: GrobleWebhookPayload, obj: GrobleWebhookPayload["data"]["object"]) {
  const sellerReference = obj.sellerReference;
  if (!sellerReference) return NextResponse.json({ ok: true });
  const server = await findServerBySellerReference(sellerReference);
  if (!server) {
    console.error(`[groble-webhook] 결제 실패 이벤트인데 sellerReference ${sellerReference}로 서버를 못 찾음`);
    return NextResponse.json({ ok: true });
  }

  const isFinal = obj.failure?.isFinal ?? false;
  await prisma.server.update({
    where: { id: server.id },
    data: { grobleSubscriptionStatus: isFinal ? "TERMINATED" : "PAST_DUE" },
  });

  await notifyOwner(
    server.ownerId,
    isFinal
      ? `⚠️ **${server.name}** 서버의 groble 정기결제가 계속 실패해서 구독이 종료됐어요(사유: ${obj.failure?.reason ?? "알 수 없음"}). 계속 쓰시려면 대시보드에서 다시 결제해주세요.`
      : `⚠️ **${server.name}** 서버의 groble 정기결제가 실패했어요(사유: ${obj.failure?.reason ?? "알 수 없음"}). ${obj.failure?.nextRetryAt ? `${obj.failure.nextRetryAt}에 다시 시도돼요.` : "곧 다시 시도돼요."} 카드 정보를 확인해주세요.`,
  );

  await prisma.auditLog.create({
    data: {
      action: "GROBLE_SUBSCRIPTION_PAYMENT_FAILED",
      targetType: "Server",
      targetId: server.id,
      metadata: { eventId: payload.id, isFinal, reason: obj.failure?.reason },
    },
  });
  console.log(`[groble-webhook] 서버 ${server.id} 정기결제 실패 기록 (isFinal=${isFinal})`);
  return NextResponse.json({ ok: true });
}

async function handleSubscriptionCancelRequested(payload: GrobleWebhookPayload, obj: GrobleWebhookPayload["data"]["object"]) {
  const sellerReference = obj.sellerReference;
  if (!sellerReference) return NextResponse.json({ ok: true });
  const server = await findServerBySellerReference(sellerReference);
  if (!server) return NextResponse.json({ ok: true });

  await prisma.server.update({ where: { id: server.id }, data: { grobleSubscriptionStatus: "CANCEL_REQUESTED" } });
  await notifyOwner(
    server.ownerId,
    `ℹ️ **${server.name}** 서버의 groble 정기결제 해지가 요청됐어요. 이번 결제 기간이 끝나면 더 이상 자동으로 갱신되지 않아요 — 계속 쓰시려면 해지를 취소하거나 기간이 끝나기 전에 다른 방법으로 미리 갱신해주세요.`,
  );
  await prisma.auditLog.create({
    data: { action: "GROBLE_SUBSCRIPTION_CANCEL_REQUESTED", targetType: "Server", targetId: server.id, metadata: { eventId: payload.id } },
  });
  console.log(`[groble-webhook] 서버 ${server.id} 구독 해지 요청 기록`);
  return NextResponse.json({ ok: true });
}

async function handleSubscriptionTerminated(payload: GrobleWebhookPayload, obj: GrobleWebhookPayload["data"]["object"]) {
  const sellerReference = obj.sellerReference;
  if (!sellerReference) return NextResponse.json({ ok: true });
  const server = await findServerBySellerReference(sellerReference);
  if (!server) return NextResponse.json({ ok: true });

  await prisma.server.update({
    where: { id: server.id },
    data: { grobleSubscriptionStatus: "TERMINATED", grobleNextBillingDate: null },
  });
  await notifyOwner(
    server.ownerId,
    `ℹ️ **${server.name}** 서버의 groble 정기결제 구독이 종료됐어요(사유: ${obj.termination?.reason ?? "알 수 없음"}). 더 이상 자동으로 갱신되지 않으니, 계속 쓰시려면 대시보드에서 수동으로 결제해주세요.`,
  );
  await prisma.auditLog.create({
    data: { action: "GROBLE_SUBSCRIPTION_TERMINATED", targetType: "Server", targetId: server.id, metadata: { eventId: payload.id, reason: obj.termination?.reason, cancelledBy: obj.cancelledBy } },
  });
  console.log(`[groble-webhook] 서버 ${server.id} 구독 종료 기록`);
  return NextResponse.json({ ok: true });
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

  const obj = payload.data?.object;
  if (!obj) {
    console.log(`[groble-webhook] ${payload.type} 이벤트에 data.object 없음(확인만)`);
    return NextResponse.json({ ok: true });
  }

  switch (payload.type) {
    case "subscription_payment.completed":
      return obj.subscription?.billingReason === "RENEWAL"
        ? handleRenewalPayment(payload, obj)
        : handleInitialPayment(payload, obj);
    case "subscription_payment.failed":
      return handleSubscriptionFailed(payload, obj);
    case "subscription.cancel_requested":
      return handleSubscriptionCancelRequested(payload, obj);
    case "subscription.terminated":
      return handleSubscriptionTerminated(payload, obj);
    // 일회성 결제(고정 플랜을 구독이 아니라 단건으로 파는 상품이 생길 경우를 대비해 유지) —
    // 기존 1회성 체결 로직 그대로.
    case "payment.completed":
      return handleInitialPayment(payload, obj);
    // 일회성/정기결제 취소·환불은 이미 프로비저닝된 서버를 자동으로 되돌리는 게 위험해서
    // (예: 이미 며칠 써버린 서버를 자동 삭제/정지하면 분쟁 소지) 자동 처리하지 않고, 관리자가
    // 보고 직접 판단하도록 감사 로그만 남긴다.
    case "payment.cancel_requested":
    case "payment.refunded":
    case "subscription_payment.refunded":
      await prisma.auditLog.create({
        data: {
          action: "GROBLE_CANCEL_OR_REFUND_EVENT",
          targetType: "Order",
          targetId: obj.sellerReference ?? "unknown",
          metadata: { eventId: payload.id, type: payload.type, merchantUid: obj.merchantUid },
        },
      }).catch(() => {});
      console.log(`[groble-webhook] ${payload.type} 이벤트 수신 — 감사 로그만 남기고 자동 처리는 안 함 (evt: ${payload.id})`);
      return NextResponse.json({ ok: true });
    default:
      console.log(`[groble-webhook] ${payload.type} 이벤트 수신(처리 안 함, 확인만)`);
      return NextResponse.json({ ok: true });
  }
}
