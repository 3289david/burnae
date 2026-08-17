import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { deleteServerFully } from "@/lib/provisioning";

const schema = z.object({ createFinalBackup: z.boolean().default(true) });

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { createFinalBackup } = schema.parse(body);

  const result = await deleteServerFully(id, { createFinalBackup, requestedByUserId: admin.id });
  return NextResponse.json(result);
}
