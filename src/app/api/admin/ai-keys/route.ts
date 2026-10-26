import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminRole } from "@/lib/auth";
import { getApmixKeys, addApmixKeys } from "@/lib/ai/apmix";

export async function GET() {
  const admin = await requireAdminRole(["SUPER", "GENERAL"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const keys = await getApmixKeys();
  return NextResponse.json({ keys });
}

const addSchema = z.object({
  key: z.string().optional(),
  keys: z.array(z.string()).optional(),
  rawKeys: z.string().optional(),
  label: z.string().max(100).optional(),
});

export async function POST(request: Request) {
  const admin = await requireAdminRole(["SUPER", "GENERAL"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 422 });
  }

  const { key, keys, rawKeys, label } = parsed.data;
  const toAdd: { key: string; label?: string }[] = [];

  if (rawKeys) {
    const lines = rawKeys.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    for (const l of lines) {
      toAdd.push({ key: l, label });
    }
  } else if (keys && Array.isArray(keys)) {
    for (const k of keys) {
      const trimmed = k.trim();
      if (trimmed) toAdd.push({ key: trimmed, label });
    }
  } else if (key) {
    const trimmed = key.trim();
    if (trimmed) toAdd.push({ key: trimmed, label });
  }

  if (toAdd.length === 0) {
    return NextResponse.json({ error: "추가할 API 키를 1개 이상 입력해주세요." }, { status: 422 });
  }

  const count = await addApmixKeys(toAdd);
  const updatedKeys = await getApmixKeys();

  return NextResponse.json({ ok: true, addedCount: count, keys: updatedKeys });
}
