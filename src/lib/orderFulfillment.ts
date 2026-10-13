import { prisma } from "@/lib/prisma";
import { createServerForOrder, ProvisioningError } from "@/lib/provisioning";
import { PteroApp, PteroClient } from "@/lib/pterodactyl";
import { rewardReferralFirstPayment } from "@/lib/promotions";
import { logServerActivity } from "@/lib/serverActivityLog";
import { sendDiscordDM, createPrivateThreadWithMember } from "@/lib/discordNotify";
import { getBotSettings } from "@/lib/botSettings";
import type { Order, User } from "@/generated/prisma/client";

/**
 * "전용서버"류(requiresDedicatedNode) 상품은 실제 물리/가상 장비를 새로 들여야 해서 자동으로
 * 끝낼 수 없다 — 관리자에게 전용 노드를 배정해달라고 알리고, 고객과는 세부 요구사항을 조율할
 * 1:1 비공개 채널을 열어준다. dedicatedNodeAlertSent로 주문당 한 번만 보낸다.
 */
async function notifyDedicatedNodeNeeded(order: Order & { user: User }) {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
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

  if (order.user.referredByUserId) {
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

  await prisma.order.update({
    where: { id: order.id },
    data: { status: "PAID", paidAt: new Date() },
  });

  // 여기서부터 실패하면(네트워크 오류, Pterodactyl 장애 등) 결제 상태를 PENDING으로 되돌려서
  // 다음 크론 주기나 재시도에서 다시 처리할 수 있게 한다 — 안 그러면 위에서 이미 PAID로
  // 바뀐 뒤라 44번째 줄의 멱등 가드에 막혀 영원히 재시도가 안 되고, 고객은 돈은 냈는데
  // 서버/갱신/업그레이드는 적용 안 된 채로 방치된다
  try {
    if (order.couponId) {
      await prisma.coupon.update({
        where: { id: order.couponId },
        data: { usedCount: { increment: 1 } },
      });
    }

    if (order.type === "AI_CREDITS") {
      if (order.aiCreditsAmount) {
        await prisma.user.update({
          where: { id: order.userId },
          data: { aiCreditsRemaining: { increment: order.aiCreditsAmount } },
        });
      }
    } else if (order.type === "POINTS") {
      if (order.pointsAmount) {
        await prisma.user.update({
          where: { id: order.userId },
          data: { promotionPoints: { increment: order.pointsAmount } },
        });
      }
    } else if (order.type === "NEW_SERVER") {
      // 결제 시점에 서버 종류/버전을 아직 안 골랐으면(결제 후 선택 방식) 여기서 바로 만들지 않고
      // 고객이 /api/orders/[id]/select-template 로 고른 뒤에 provisionNewServerOrder를 부른다.
      if (!order.templateIdRequested) return;
      await provisionNewServerOrder(order.id);
    } else if (order.type === "RENEWAL" && order.serverId) {
      const server = await prisma.server.findUniqueOrThrow({ where: { id: order.serverId } });
      const nextDue = addOneMonthClamped(
        new Date(Math.max(Date.now(), server.renewalDueAt?.getTime() ?? Date.now())),
      );
      await prisma.server.update({
        where: { id: server.id },
        data: { renewalDueAt: nextDue, status: server.status === "SUSPENDED" ? "STOPPED" : server.status },
      });
      if (server.status === "SUSPENDED" && server.pterodactylServerId) {
        await PteroApp.unsuspendServer(server.pterodactylServerId);
      }
      await logServerActivity(server.id, order.userId, "RENEW");
      if (order.product && order.product.aiCreditsPerMonth > 0) {
        await prisma.user.update({
          where: { id: order.userId },
          data: { aiCreditsRemaining: { increment: order.product.aiCreditsPerMonth } },
        });
      }
    } else if (order.type === "UPGRADE" && order.serverId && order.product) {
      const server = await prisma.server.findUniqueOrThrow({ where: { id: order.serverId } });
      await PteroApp.updateServerBuild(server.pterodactylServerId!, {
        memoryMb: order.product.ramMb,
        diskMb: order.product.diskMb,
        cpuPercent: order.product.cpuPercent,
        backupSlots: order.product.backupSlots,
      });
      await prisma.server.update({
        where: { id: server.id },
        data: {
          productId: order.productId ?? undefined,
          productNameSnapshot: order.product.name,
          priceMonthlyKrwSnapshot: order.product.priceMonthlyKrw,
          ramMb: order.product.ramMb,
          diskMb: order.product.diskMb,
          cpuPercent: order.product.cpuPercent,
          backupSlots: order.product.backupSlots,
        },
      });
      if (server.pterodactylIdentifier) {
        await PteroClient.sendPowerAction(server.pterodactylIdentifier, "restart");
      }
      await logServerActivity(server.id, order.userId, "RESOURCE_UPGRADE", order.product.name);
    }
  } catch (err) {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "PENDING", paidAt: null },
    });
    throw err;
  }
}

/**
 * "선주문"(preorderWaiting) 상태인 주문을 다시 배치해본다. 여전히 자리가 없으면
 * ProvisioningError가 그대로 올라오니, 호출하는 쪽(크론)에서 잡아서 다음 주기에 또 시도하면 된다.
 */
export async function retryPreorderFulfillment(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { user: true } });
  if (!order || !order.preorderWaiting || order.serverId) return;

  await createServerForOrder(order.id);
  await prisma.order.update({ where: { id: order.id }, data: { preorderWaiting: false } });

  if (order.user.referredByUserId) {
    await rewardReferralFirstPayment(order.user.referredByUserId, order.userId).catch((err) => {
      console.error("[orderFulfillment] 추천 첫결제 포인트 지급 실패:", err);
    });
  }
}
