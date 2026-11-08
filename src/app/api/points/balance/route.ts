import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

/** 예전엔 /api/ai-credits/balance였다 — AI 크레딧이 포인트로 통합되면서 이 경로로 옮겼다 */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  return NextResponse.json({ points: user.promotionPoints });
}
