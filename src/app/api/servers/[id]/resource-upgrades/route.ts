import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const access = await authorizeServerAccess(user, id);
  if (!access) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });

  const grants = await prisma.resourceUpgradeGrant.findMany({
    where: { serverId: id },
    orderBy: { expiresAt: "asc" },
    select: { id: true, kind: true, amount: true, expiresAt: true },
  });
  return NextResponse.json(grants);
}
