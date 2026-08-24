import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { testConnection } from "@/lib/hanabank";

/** 앱키/시크릿으로 토큰 발급까지 실제로 시도해서 하나은행 API 연동이 살아있는지 확인 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  try {
    await testConnection();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "연동 테스트 실패";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
