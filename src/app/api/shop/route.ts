import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const items = await prisma.shopItem.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  return NextResponse.json(items);
}
