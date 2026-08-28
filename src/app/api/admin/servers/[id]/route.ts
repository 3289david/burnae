import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { deleteServerFully } from "@/lib/provisioning";
import { withApiErrorHandling } from "@/lib/apiHandler";

const schema = z.object({ createFinalBackup: z.boolean().default(true) });

export const DELETE = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  const result = await deleteServerFully(id, { createFinalBackup: parsed.data.createFinalBackup, requestedByUserId: admin.id });
  return NextResponse.json(result);
});
