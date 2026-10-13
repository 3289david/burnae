import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

/** 전체 문의 스레드 목록 — 최근 활동순, 유저 정보와 마지막 메시지 미리보기 포함 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const threads = await prisma.supportThread.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      user: { select: { id: true, name: true, email: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return NextResponse.json(
    threads.map((t) => ({
      id: t.id,
      status: t.status,
      updatedAt: t.updatedAt,
      user: t.user,
      lastMessage: t.messages[0] ?? null,
    })),
  );
}
