import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { reviewCompletion } from "@/lib/promotions";

const schema = z.object({ approve: z.boolean() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 422 });
  }

  try {
    const updated = await reviewCompletion(id, parsed.data.approve);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "처리에 실패했어요.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
