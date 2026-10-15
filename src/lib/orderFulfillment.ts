import { prisma } from "@/lib/prisma";
import { createServerForOrder, ProvisioningError } from "@/lib/provisioning";
import { PteroApp, PteroClient } from "@/lib/pterodactyl";
import { rewardReferralFirstPayment } from "@/lib/promotions";
import { logServerActivity } from "@/lib/serverActivityLog";
import { sendDiscordDM, createPrivateThreadWithMember } from "@/lib/discordNotify";
import { getBotSettings } from "@/lib/botSettings";
import { getAdminEmail } from "@/lib/auth";
import type { Order, User } from "@/generated/prisma/client";

/**
 * "전용서버"류(requiresDedicatedNode) 상품은 실제 물리/가상 장비를 새로 들여야 해서 자동으로
 * 끝낼 수 없다 — 관리자에게 전용 노드를 배정해달라고 알리고, 고객과는 세부 요구사항을 조율할
 * 1:1 비공개 채널을 열어준다. dedicatedNodeAlertSent로 주문당 한 번만 보낸다.
 */
async function notifyDedicatedNodeNeeded(order: Order & { user: User }) {
  // role==="ADMIN"인 유저가 이제 여러 명(역할별 부관리자 포함)이라, 특정 조건 없는
  // findFirst는 임의의 한 명(예: 커뮤니티 담당자)을 집어서 중요한 알림을 놓칠 수 있다 —
  // 소유자 계정으로 특정해서 보낸다.
  const admin = await prisma.user.findFirst({ where: { email: { equals: getAdminEmail(), mode: "insensitive" } } });
  if (admin) {
    const adminLink = await prisma.discordLink.findUnique({ where: { userId: admin.id } });
    if (adminLink) {
      await sendDiscordDM(
        adminLink.discordUserId,
        `🖥️ 전용서버 주문이 들어왔어요 — **${order.user.name}**(${order.user.email})님에게 전용 노드를 배정해주세요.\n관리자 페이지 > 노드에서 이 유저 이메일로 지정하면 바로 서버가 만들어져요.`,
      ).catch(() => {});
    }
  }

  const customerLink = await prisma.discordLink.findUnique({ where: { userId: order.userId } });
  const settings = await getBotSettings();
  if (customerLink && settings?.logChannelId) {
    await createPrivateThreadWithMember(
      settings.logChannelId,
      `전용서버-${order.user.name}`,
      customerLink.discordUserId,
      "전용서버 주문 감사해요! 전용 장비를 준비하는 동안 원하시는 사양(용도, 예상 동시 접속/트래픽, 필요한 서버 종류 등)을 여기서 편하게 알려주세요.",
    ).catch((err) => console.error("[orderFulfillment] 전용서버 상담 채널 개설 실패:", err));
  }

  await prisma.order.update({ where: { id: order.id }, data: { dedicatedNodeAlertSent: true } });
}

/**
 * Date.setMonth은 그 달에 없는 날짜(예: 1/31 + 1달 = 2/31)를 다음다음 달로 넘겨버린다(3/3 등) —
 * 매달 결제일이 조금씩 밀리는 걸 막기 위해 없는 날짜는 그 달의 마지막 날로 맞춘다
 */
function addOneMonthClamped(date: Date): Date {
  const day = date.getDate();
  const next = new Date(date);
  next.setDate(1);
  next.setMonth(next.getMonth() + 1);
  const lastDayOfNextMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDayOfNextMonth));
  return next;
}

/**
 * 결제 완료 + 서버 종류/버전 선택까지 끝난 신규 서버 주문을 실제로 프로비저닝한다.
 * 결제 시점에 바로 골랐으면 markOrderPaidAndFulfill에서, 결제 후에 나중에 골랐으면
 * /api/orders/[id] (select-template)에서 호출한다.
 */
export async function provisionNewServerOrder(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { user: true, product: true },
  });

  try {
    await createServerForOrder(order.id);
  } catch (err) {
    if (err instanceof ProvisioningError) {
      // 결제는 끝났지만 지금 당장 배치할 노드 자리가 없음 — "선주문"으로 전환하고
      // 크론이 주기적으로 재시도하게 한다 (handlePreorderRetries)
      await prisma.order.update({ where: { id: order.id }, data: { preorderWaiting: true } });
      console.error(`[orderFulfillment] 주문 ${order.id} 노드 자리 없음 — 선주문 대기로 전환:`, err.message);
      if (order.product?.requiresDedicatedNode && !order.dedicatedNodeAlertSent) {
        await notifyDedicatedNodeNeeded(order).catch((e) =>
          console.error("[orderFulfillment] 전용서버 안내 실패:", e),
        );
      }
      return;
    }
    throw err;
  }

  // "첫 결제" 보너스는 말 그대로 유료 서버를 처음 만들었을 때만 — 0원 무료 서버로는 지급 안 함
  // (안 그러면 추천 계정을 만들어 무료 서버만 반복 생성하는 것으로 포인트를 파밍할 수 있다)
  if (order.user.referredByUserId && (order.product?.priceMonthlyKrw ?? 0) > 0) {
    await rewardReferralFirstPayment(order.user.referredByUserId, order.userId).catch((err) => {
      console.error("[orderFulfillment] 추천 첫결제 포인트 지급 실패:", err);
    });
  }
}

/**
 * 입금(또는 포인트 교환)이 확인된 주문을 실제로 처리한다 — 신규 서버 생성 / 갱신 / 업그레이드 적용.
 * 하나은행 거래내역 폴링 크론과 포인트 교환 라우트에서 공용으로 호출한다.
 */
export async function markOrderPaidAndFulfill(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { server: true, product: true, user: true },
  });
  if (!order) return;
  if (order.status === "PAID") return; // 멱등 처리 — 이미 처리된 결제

  // 하나은행 폴링 크론과 결제 웹훅이 거의 같은 순간 같은 주문을 처리하려고 할 수 있다 — 조건부
  // update(현재 status가 PAID가 아닐 때만 PAID로)로 원자적 "선점"을 만들어 둘 다 통과하는 걸 막는다.
  const claimed = await prisma.order.updateMany({
    where: { id: order.id, status: { not: "PAID" } },
    data: { status: "PAID", paidAt: new Date() },
  });
  if (claimed.count === 0) return;

  // 예전에는 여기서 실패하면 status를 PENDING으로 되돌려 재시도했는데, 쿠폰 차감/포인트 지급/
  // 갱신기한 연장처럼 되돌릴 수 없는 부수효과가 재시도마다 중복 실행되는 버그가 있었다
  // (Wings가 잠깐 불안정하면 같은 갱신 주문이 10분마다 재시도되며 갱신기한이 계속 늘어나는 식).
  // 이제는 status를 PENDING으로 되돌리지 않는다 — 대신 Pterodactyl처럼 외부 호출이 필요한
  // 단계를 먼저 끝내고(그 호출들은 원래부터 멱등하거나, 실패해도 DB에 아직 아무것도 안 바뀐
  // 상태라 재시도가 안전함), 나머지 DB 반영(쿠폰 차감 포함)은 트랜잭션으로 묶어 한번에 적용한다.
  // 트랜잭션 자체가 실패하면(아주 드문 DB 장애) status는 PAID인데 효과가 안 적용된 채로 남으니
  // 로그를 남겨 운영자가 직접 확인하게 한다 — "중복 지급"보다 훨씬 안전한 실패 모드다.
  try {
    if (order.type === "AI_CREDITS") {
      await prisma.$transaction(async (tx) => {
        if (order.couponId) await tx.coupon.update({ where: { id: order.couponId }, data: { usedCount: { increment: 1 } } });
        if (order.aiCreditsAmount) {
          await tx.user.update({ where: { id: order.userId }, data: { aiCreditsRemaining: { increment: order.aiCreditsAmount } } });
        }
      });
    } else if (order.type === "POINTS") {
      await prisma.$transaction(async (tx) => {
        if (order.couponId) await tx.coupon.update({ where: { id: order.couponId }, data: { usedCount: { increment: 1 } } });
        if (order.pointsAmount) {
          await tx.user.update({ where: { id: order.userId }, data: { promotionPoints: { increment: order.pointsAmount } } });
        }
      });
    } else if (order.type === "NEW_SERVER") {
      if (order.couponId) {
        await prisma.coupon.update({ where: { id: order.couponId }, data: { usedCount: { increment: 1 } } });
      }
      // 결제 시점에 서버 종류/버전을 아직 안 골랐으면(결제 후 선택 방식) 여기서 바로 만들지 않고
      // 고객이 /api/orders/[id]/select-template 로 고른 뒤에 provisionNewServerOrder를 부른다.
      if (!order.templateIdRequested) return;
      // createServerForOrder는 order.serverId/provisioningStartedAt으로 멱등하게 처리되므로
      // 실패해도(네트워크/Pterodactyl 장애) 안전하게 재시도할 수 있다.
      await provisionNewServerOrder(order.id);
    } else if (order.type === "RENEWAL" && order.serverId) {
      const server = await prisma.server.findUniqueOrThrow({ where: { id: order.serverId } });
      // unsuspend는 이미 정지 해제된 서버에 다시 호출해도 안전(멱등)하다.
      if (server.status === "SUSPENDED" && server.pterodactylServerId) {
        await PteroApp.unsuspendServer(server.pterodactylServerId);
      }
      const nextDue = addOneMonthClamped(
        new Date(Math.max(Date.now(), server.renewalDueAt?.getTime() ?? Date.now())),
      );
      await prisma.$transaction(async (tx) => {
        if (order.couponId) await tx.coupon.update({ where: { id: order.couponId }, data: { usedCount: { increment: 1 } } });
        await tx.server.update({
          where: { id: server.id },
          data: { renewalDueAt: nextDue, status: server.status === "SUSPENDED" ? "STOPPED" : server.status },
        });
        if (order.product && order.product.aiCreditsPerMonth > 0) {
          await tx.user.update({
            where: { id: order.userId },
            data: { aiCreditsRemaining: { increment: order.product.aiCreditsPerMonth } },
          });
        }
      });
      await logServerActivity(server.id, order.userId, "RENEW");
    } else if (order.type === "UPGRADE" && order.serverId && order.product) {
      const server = await prisma.server.findUniqueOrThrow({ where: { id: order.serverId } });
      await PteroApp.updateServerBuild(server.pterodactylServerId!, {
        memoryMb: order.product.ramMb,
        diskMb: order.product.diskMb,
        cpuPercent: order.product.cpuPercent,
        backupSlots: order.product.backupSlots,
      });
      if (server.pterodactylIdentifier) {
        await PteroClient.sendPowerAction(server.pterodactylIdentifier, "restart").catch((err) => {
          console.error("[orderFulfillment] 업그레이드 재시작 실패(적용은 계속 진행):", err);
        });
      }
      await prisma.$transaction(async (tx) => {
        if (order.couponId) await tx.coupon.update({ where: { id: order.couponId }, data: { usedCount: { increment: 1 } } });
        await tx.server.update({
          where: { id: server.id },
          data: {
            productId: order.productId ?? undefined,
            productNameSnapshot: order.product!.name,
            priceMonthlyKrwSnapshot: order.product!.priceMonthlyKrw,
            ramMb: order.product!.ramMb,
            diskMb: order.product!.diskMb,
            cpuPercent: order.product!.cpuPercent,
            backupSlots: order.product!.backupSlots,
          },
        });
      });
      await logServerActivity(server.id, order.userId, "RESOURCE_UPGRADE", order.product.name);
    } else if (order.couponId) {
      // 매칭되는 분기가 없어도 쿠폰은 확정 처리한다
      await prisma.coupon.update({ where: { id: order.couponId }, data: { usedCount: { increment: 1 } } });
    }
  } catch (err) {
    console.error(`[orderFulfillment] 주문 ${order.id} 결제는 확정됐지만 효과 적용 중 실패 — 직접 확인 필요:`, err);
    await prisma.auditLog.create({
      data: {
        action: "ORDER_FULFILLMENT_PARTIAL_FAILURE",
        targetType: "Order",
        targetId: order.id,
        metadata: { type: order.type, error: err instanceof Error ? err.message : String(err) },
      },
    }).catch(() => {});
    throw err;
  }
}

/**
 * "선주문"(preorderWaiting) 상태인 주문을 다시 배치해본다. 여전히 자리가 없으면
 * ProvisioningError가 그대로 올라오니, 호출하는 쪽(크론)에서 잡아서 다음 주기에 또 시도하면 된다.
 */
export async function retryPreorderFulfillment(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { user: true, product: true } });
  if (!order || !order.preorderWaiting || order.serverId) return;

  await createServerForOrder(order.id);
  await prisma.order.update({ where: { id: order.id }, data: { preorderWaiting: false } });

  if (order.user.referredByUserId && (order.product?.priceMonthlyKrw ?? 0) > 0) {
    await rewardReferralFirstPayment(order.user.referredByUserId, order.userId).catch((err) => {
      console.error("[orderFulfillment] 추천 첫결제 포인트 지급 실패:", err);
    });
  }
}
