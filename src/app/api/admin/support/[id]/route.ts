import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/auth";
import { withApiErrorHandling } from "@/lib/apiHandler";

/** 스레드 하나의 전체 메시지 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminRole(["COMMUNITY", "SUPER"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const thread = await prisma.supportThread.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!thread) return NextResponse.json({ error: "스레드를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(thread);
}

const schema = z.object({ status: z.enum(["OPEN", "CLOSED"]) });

/** 스레드 상태 변경(닫기/다시 열기) */
export const PUT = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const admin = await requireAdminRole(["COMMUNITY", "SUPER"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 422 });

  const thread = await prisma.supportThread.update({ where: { id }, data: { status: parsed.data.status } });
  return NextResponse.json(thread);
});
