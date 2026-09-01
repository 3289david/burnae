import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { withApiErrorHandling } from "@/lib/apiHandler";

export const GET = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });

  const snapshots = await prisma.serverUsageSnapshot.findMany({
    where: { serverId: id, recordedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    orderBy: { recordedAt: "asc" },
    select: { cpuPercent: true, ramMb: true, diskMb: true, recordedAt: true },
  });

  return NextResponse.json(snapshots);
});
