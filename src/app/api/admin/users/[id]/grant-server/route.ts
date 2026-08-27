import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { provisionNewServerOrder } from "@/lib/orderFulfillment";

const baseFields = {
  templateId: z.string(),
  minecraftVersion: z.string(),
  serverName: z.string().min(2).max(24),
};

const schema = z.discriminatedUnion("mode", [
  // 기존 상품 카탈로그에서 그대로 선택
  z.object({ mode: z.literal("existing"), productId: z.string(), ...baseFields }),
  // RAM/CPU/디스크/백업 슬롯을 직접 입력해서 이번 지급 전용 상품을 즉석에서 만듦
  z.object({
    mode: z.literal("custom"),
    ramMb: z.number().int().min(512),
    cpuPercent: z.number().int().min(25),
    diskMb: z.number().int().min(256),
    backupSlots: z.number().int().min(0).default(1),
    ...baseFields,
  }),
]);

/**
 * 관리자가 결제/포인트 없이 특정 유저에게 서버를 바로 지급한다 (이벤트 경품, 보상, 테스트용 등).
 * "custom" 모드는 얼마나 줄지(RAM/CPU/디스크/백업 슬롯) 직접 정할 수 있게, 그 스펙 그대로
 * 비공개(active: false) 상품을 하나 만들어서 기존 주문 처리 파이프라인을 그대로 재사용한다.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id: userId } = await params;
  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser) return NextResponse.json({ error: "유저를 찾을 수 없습니다." }, { status: 404 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." }, { status: 422 });
  }
  const input = parsed.data;

  let productId: string;
  if (input.mode === "existing") {
    const product = await prisma.product.findUnique({
      where: { id: input.productId, active: true },
      include: { allowedTemplates: true },
    });
    if (!product) return NextResponse.json({ error: "존재하지 않는 상품입니다." }, { status: 404 });
    if (!product.allowedTemplates.some((t) => t.id === input.templateId)) {
      return NextResponse.json({ error: "이 상품에서 선택할 수 없는 서버 종류입니다." }, { status: 422 });
    }
    productId = product.id;
  } else {
    const template = await prisma.serverTemplate.findUnique({ where: { id: input.templateId, active: true } });
    if (!template) return NextResponse.json({ error: "존재하지 않는 서버 종류입니다." }, { status: 404 });

    const grantProduct = await prisma.product.create({
      data: {
        name: `[관리자 지급] ${targetUser.name} · ${input.serverName}`,
        ramMb: input.ramMb,
        cpuPercent: input.cpuPercent,
        diskMb: input.diskMb,
        backupSlots: input.backupSlots,
        priceMonthlyKrw: 0,
        active: false, // 고객 가격표/카탈로그에는 노출되지 않고, 이 지급 건 기록용으로만 남는다
        allowedTemplates: { connect: [{ id: template.id }] },
      },
    });
    productId = grantProduct.id;
  }

  const order = await prisma.order.create({
    data: {
      userId,
      productId,
      type: "NEW_SERVER",
      amountKrw: 0,
      depositorName: "관리자지급",
      status: "PAID",
      paidAt: new Date(),
      serverNameRequested: input.serverName,
      templateIdRequested: input.templateId,
      minecraftVersionRequested: input.minecraftVersion,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "ADMIN_SERVER_GRANTED",
      targetType: "User",
      targetId: userId,
      metadata: {
        orderId: order.id,
        productId,
        serverName: input.serverName,
        mode: input.mode,
        ...(input.mode === "custom"
          ? { ramMb: input.ramMb, cpuPercent: input.cpuPercent, diskMb: input.diskMb, backupSlots: input.backupSlots }
          : {}),
      },
    },
  });

  try {
    await provisionNewServerOrder(order.id);
  } catch (err) {
    console.error("[admin grant-server] 서버 생성 실패:", err);
    // 노드 자리가 없으면 provisionNewServerOrder 내부에서 "선주문" 대기로 자동 전환된다
  }

  const updated = await prisma.order.findUnique({ where: { id: order.id } });
  return NextResponse.json(updated);
}
