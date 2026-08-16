import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const servers = await prisma.server.findMany({
    where: {
      deletedAt: null,
      OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
    },
    include: { template: true, product: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(servers);
}
