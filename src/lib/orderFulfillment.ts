import { prisma } from "@/lib/prisma";
import { createServerForOrder, ProvisioningError } from "@/lib/provisioning";
import { PteroApp, PteroClient } from "@/lib/pterodactyl";
import { rewardReferralFirstPayment } from "@/lib/promotions";

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

  if (order.couponId) {
    await prisma.coupon.update({
      where: { id: order.couponId },
      data: { usedCount: { increment: 1 } },
    });
  }

  if (order.type === "NEW_SERVER") {
    try {
      await createServerForOrder(order.id);
    } catch (err) {
      if (err instanceof ProvisioningError) {
        // 결제는 끝났지만 지금 당장 배치할 노드 자리가 없음 — "선주문"으로 전환하고
        // 크론이 주기적으로 재시도하게 한다 (handlePreorderRetries)
        await prisma.order.update({ where: { id: order.id }, data: { preorderWaiting: true } });
        console.error(`[orderFulfillment] 주문 ${order.id} 노드 자리 없음 — 선주문 대기로 전환:`, err.message);
        return;
      }
      throw err;
    }

    if (order.user.referredByUserId) {
      await rewardReferralFirstPayment(order.user.referredByUserId, order.userId).catch((err) => {
        console.error("[orderFulfillment] 추천 첫결제 포인트 지급 실패:", err);
      });
    }
  } else if (order.type === "RENEWAL" && order.serverId) {
    const server = await prisma.server.findUniqueOrThrow({ where: { id: order.serverId } });
    const nextDue = new Date(Math.max(Date.now(), server.renewalDueAt?.getTime() ?? Date.now()));
    nextDue.setMonth(nextDue.getMonth() + 1);
    await prisma.server.update({
      where: { id: server.id },
      data: { renewalDueAt: nextDue, status: server.status === "SUSPENDED" ? "STOPPED" : server.status },
    });
    if (server.status === "SUSPENDED" && server.pterodactylServerId) {
      await PteroApp.unsuspendServer(server.pterodactylServerId);
    }
    if (order.product.aiCreditsPerMonth > 0) {
      await prisma.user.update({
        where: { id: order.userId },
        data: { aiCreditsRemaining: { increment: order.product.aiCreditsPerMonth } },
      });
    }
  } else if (order.type === "UPGRADE" && order.serverId) {
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
        productId: order.productId,
        ramMb: order.product.ramMb,
        diskMb: order.product.diskMb,
        cpuPercent: order.product.cpuPercent,
        backupSlots: order.product.backupSlots,
      },
    });
    if (server.pterodactylIdentifier) {
      await PteroClient.sendPowerAction(server.pterodactylIdentifier, "restart");
    }
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
