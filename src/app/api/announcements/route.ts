import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * 지금 시점에 실제로 노출돼야 하는 공지만 반환 (누구나 조회 가능 — 로그인 불필요).
 * 공개 랜딩페이지에서도 호출하므로, DB 장애 시에도 절대 깨지지 않고 빈 배열을 반환한다.
 */
export async function GET() {
  const now = new Date();
  try {
    const announcements = await prisma.announcement.findMany({
      where: {
        active: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, body: true, level: true },
    });
    return NextResponse.json(announcements);
  } catch (err) {
    console.error("[announcements] 조회 실패:", err);
    return NextResponse.json([]);
  }
}
