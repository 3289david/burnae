import { NextResponse } from "next/server";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { requireApiUser } from "@/lib/apiAuth";
import { withApiErrorHandling } from "@/lib/apiHandler";
import { prisma } from "@/lib/prisma";

/** 최신 리소스 사용량 스냅샷 + 플랜 한도. CLI/대시보드 외부 모니터링용 공개 API */
export const GET = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "유효하지 않은 토큰이에요." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });

  const latest = await prisma.serverUsageSnapshot.findFirst({
    where: { serverId: id },
    orderBy: { recordedAt: "desc" },
  });

  return NextResponse.json({
    recordedAt: latest?.recordedAt ?? null,
    cpu: { usedPercent: latest?.cpuPercent ?? null, limitPercent: server.cpuPercent },
    ram: { usedMb: latest?.ramMb ?? null, limitMb: server.ramMb },
    disk: { usedMb: latest?.diskMb ?? null, limitMb: server.diskMb },
  });
});
