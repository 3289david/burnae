import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminRole } from "@/lib/auth";
import { testApmixKey, getApmixKeys } from "@/lib/ai/apmix";

const testSchema = z.object({
  id: z.string().optional(),
  key: z.string().optional(),
});

export async function POST(request: Request) {
  const admin = await requireAdminRole(["SUPER", "GENERAL"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = testSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 422 });
  }

  let rawKey = parsed.data.key?.trim();
  if (!rawKey && parsed.data.id) {
    const keys = await getApmixKeys();
    const found = keys.find((k) => k.id === parsed.data.id);
    if (!found) {
      return NextResponse.json({ error: "키를 찾을 수 없습니다." }, { status: 404 });
    }
    rawKey = found.key;
  }

  if (!rawKey) {
    return NextResponse.json({ error: "테스트할 키가 지정되지 않았습니다." }, { status: 422 });
  }

  const result = await testApmixKey(rawKey);
  return NextResponse.json(result);
}
