import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { renewFreeServer, ServerRenewalError } from "@/lib/serverRenewal";

/** 포인트 교환 등 무료 서버 전용 갱신 — 결제 없이 7일 연장. 결제 상품은 /renew(결제 주문) 사용 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  try {
    const server = await renewFreeServer(prisma, id, user.id);
    return NextResponse.json(server);
  } catch (err) {
    if (err instanceof ServerRenewalError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }
}
