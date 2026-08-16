import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const now = new Date();
  const events = await prisma.event.findMany({
    where: { active: true, startsAt: { lte: now }, endsAt: { gte: now } },
    orderBy: { startsAt: "desc" },
    include: { coupon: { select: { code: true, discountType: true, discountValue: true } } },
  });
  return NextResponse.json(events);
}
