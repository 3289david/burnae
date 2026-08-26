import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { retryPreorderFulfillment } from "@/lib/orderFulfillment";
import { ProvisioningError } from "@/lib/provisioning";

/** 관리자가 선주문 하나를 지금 바로 배치해본다 (자동 처리가 꺼져 있을 때 수동으로 처리하는 용도) */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  try {
    await retryPreorderFulfillment(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ProvisioningError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[admin preorders] 수동 배치 실패:", err);
    return NextResponse.json({ error: "서버 생성에 실패했어요." }, { status: 500 });
  }
}
