import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withApiErrorHandling } from "@/lib/apiHandler";

const RECENT_WINDOW_MS = 30 * 60_000;

/**
 * groble.im 결제 완료 후 돌아오는 이동 페이지(payment/groble-complete)는 groble이 쿼리 파라미터를
 * 전혀 안 실어줘서(문서 확인함) orderId를 모른다 — 대신 로그인 세션은 그대로 있으니(같은 브라우저
 * 탭에서 결제하러 넘어간 거라 쿠키가 살아있음), "방금 groble로 결제한 내 가장 최근 주문"을
 * 역으로 찾아서 "서버 구성하기" 버튼이 어디로 갈지 알려준다. 너무 오래된 주문까지 잡히지 않게
 * 최근 30분 이내로만 본다.
 */
export const GET = withApiErrorHandling(async () => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const order = await prisma.order.findFirst({
    where: {
      userId: user.id,
      grobleMerchantUid: { not: null },
      paidAt: { gte: new Date(Date.now() - RECENT_WINDOW_MS) },
    },
    orderBy: { paidAt: "desc" },
    select: { id: true, serverId: true },
  });

  if (!order) return NextResponse.json({ error: "최근 groble 결제 내역을 찾을 수 없어요." }, { status: 404 });
  return NextResponse.json(order);
});
