import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const baseFields = {
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
 * 서버 종류(로더)/마인크래프트 버전은 관리자가 정하지 않는다 — 결제 후 선택 흐름과 동일하게
 * 유저가 로그인해서 직접 고르면 그때 실제로 생성된다.
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
  let productName: string;
  if (input.mode === "existing") {
    const product = await prisma.product.findUnique({
      where: { id: input.productId, active: true },
      include: { allowedTemplates: true },
    });
    if (!product) return NextResponse.json({ error: "존재하지 않는 상품입니다." }, { status: 404 });
    if (product.allowedTemplates.length === 0) {
      return NextResponse.json({ error: "이 상품에는 선택 가능한 서버 종류가 없습니다." }, { status: 422 });
    }
    productId = product.id;
    productName = product.name;
  } else {
    const activeTemplates = await prisma.serverTemplate.findMany({ where: { active: true } });
    if (activeTemplates.length === 0) {
      return NextResponse.json({ error: "선택 가능한 서버 종류가 없습니다." }, { status: 404 });
    }

    const grantProduct = await prisma.product.create({
      data: {
        name: `[관리자 지급] ${targetUser.name} · ${input.serverName}`,
        ramMb: input.ramMb,
        cpuPercent: input.cpuPercent,
        diskMb: input.diskMb,
        backupSlots: input.backupSlots,
        priceMonthlyKrw: 0,
        active: false, // 고객 가격표/카탈로그에는 노출되지 않고, 이 지급 건 기록용으로만 남는다
        // 유저가 직접 로더/버전을 고를 수 있도록 지원되는 모든 서버 종류를 연결해둔다
        allowedTemplates: { connect: activeTemplates.map((t) => ({ id: t.id })) },
      },
    });
    productId = grantProduct.id;
    productName = grantProduct.name;
  }

  const order = await prisma.order.create({
    data: {
      userId,
      productId,
      productNameSnapshot: productName,
      type: "NEW_SERVER",
      amountKrw: 0,
      depositorName: "관리자지급",
      status: "PAID",
      paidAt: new Date(),
      serverNameRequested: input.serverName,
      // 서버 종류/버전은 여기서 정하지 않는다 — 유저가 로그인해서 직접 고르면
      // /api/orders/[id] (select-template)에서 provisionNewServerOrder가 호출된다
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

  // 결제 후 선택 흐름과 동일하게, 유저가 /dashboard/servers/new?orderId=... 에서
  // 종류/버전을 고르기 전까지는 실제 서버를 만들지 않는다
  return NextResponse.json(order);
}
