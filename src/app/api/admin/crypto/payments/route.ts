import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/auth";

/** 결제/주문 담당(GENERAL) 이상이면 조회는 가능 — 승인/거절(review)만 SUPER로 더 좁게 막는다 */
export async function GET(request: Request) {
  const admin = await requireAdminRole(["GENERAL", "SUPER"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const status = new URL(request.url).searchParams.get("status");
  const payments = await prisma.cryptoPayment.findMany({
    where: status ? { status: status as never } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      order: {
        select: {
          id: true,
          type: true,
          amountKrw: true,
          productNameSnapshot: true,
          serverNameRequested: true,
          user: { select: { email: true, name: true } },
        },
      },
    },
  });
  return NextResponse.json(payments);
}
