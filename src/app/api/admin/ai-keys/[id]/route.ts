import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminRole } from "@/lib/auth";
import { updateApmixKey, deleteApmixKey, getApmixKeys } from "@/lib/ai/apmix";

const patchSchema = z.object({
  active: z.boolean().optional(),
  label: z.string().max(100).optional(),
  resetFail: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminRole(["SUPER", "GENERAL"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 422 });
  }

  await updateApmixKey(id, parsed.data);
  const keys = await getApmixKeys();
  return NextResponse.json({ ok: true, keys });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminRole(["SUPER", "GENERAL"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  await deleteApmixKey(id);
  const keys = await getApmixKeys();
  return NextResponse.json({ ok: true, keys });
}
