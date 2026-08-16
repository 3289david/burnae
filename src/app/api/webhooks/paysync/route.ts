import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature, type PaySyncWebhookEvent } from "@/lib/paysync";
import { createServerForOrder } from "@/lib/provisioning";
import { PteroApp, PteroClient } from "@/lib/pterodactyl";

// 페이싱크는 정확히 HTTP 200 응답만 성공으로 인정한다 (201/204 등은 실패로 간주됨)
export async function POST(request: Request) {
  const rawBody = await request.text();
  const webhookId = request.headers.get("webhook-id");
  const timestamp = request.headers.get("webhook-timestamp");
  const signature = request.headers.get("webhook-signature");

  if (!webhookId || !timestamp || !signature) {
    return new Response("missing signature headers", { status: 401 });
  }

  let valid: boolean;
  try {
    valid = verifyWebhookSignature({ rawBody, webhookId, timestamp, signatureHeader: signature });
  } catch (err) {
    console.error("[paysync webhook] 서명 검증 설정 오류:", err);
    return new Response("server misconfigured", { status: 500 });
  }
  if (!valid) return new Response("invalid signature", { status: 401 });

  const event = JSON.parse(rawBody) as PaySyncWebhookEvent;

  try {
    switch (event.type) {
      case "invoice.paid":
        await handleInvoicePaid(event);
        break;
      case "invoice.created":
      case "invoice.deleted":
        // 정보성 이벤트 — Order 상태는 우리 쪽에서 이미 생성 시점에 관리하므로 별도 처리 없음
        break;
      default:
        break;
    }
  } catch (err) {
    // 웹훅 처리 실패는 로그만 남기고 200을 반환 (페이싱크는 자동 재시도가 없으므로
    // 500을 반환하면 이 결제 건은 영영 재처리되지 않음 — 대신 운영진이 대시보드에서 확인)
    console.error("[paysync webhook] 처리 실패:", err);
  }

  return new Response("ok", { status: 200 });
}

async function handleInvoicePaid(event: PaySyncWebhookEvent) {
  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { paysyncInvoiceId: event.invoice.id },
        { id: event.invoice.metadata?.orderId ?? "__none__" },
      ],
    },
    include: { server: true, product: true },
  });

  if (!order) {
    console.error("[paysync webhook] 주문을 찾을 수 없음:", event.invoice.id);
    return;
  }

  if (order.status === "PAID") return; // 멱등 처리 — 이미 처리된 결제

  await prisma.order.update({
    where: { id: order.id },
    data: { status: "PAID", paidAt: new Date(), paysyncInvoiceId: event.invoice.id },
  });

  if (order.couponId) {
    await prisma.coupon.update({
      where: { id: order.couponId },
      data: { usedCount: { increment: 1 } },
    });
  }

  if (order.type === "NEW_SERVER") {
    await createServerForOrder(order.id);
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
