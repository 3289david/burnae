import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/apiAuth";
import { withApiErrorHandling } from "@/lib/apiHandler";

/**
 * 공개 API(/api/v1) — Render/Railway/Fly.io처럼 CLI나 스크립트에서 자기 서버를 조회·조작할 수
 * 있게 해준다. 세션 쿠키 대신 계정 설정에서 발급한 개인 토큰(Authorization: Bearer burn_...)으로 인증한다.
 */
export const GET = withApiErrorHandling(async (request: Request) => {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "유효하지 않은 토큰이에요." }, { status: 401 });

  const servers = await prisma.server.findMany({
    where: {
      deletedAt: null,
      OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
    },
    orderBy: { createdAt: "desc" },
    include: { subdomains: { where: { isPrimary: true }, take: 1 }, template: { select: { key: true, category: true } } },
  });

  return NextResponse.json(
    servers.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      category: s.template.category,
      templateKey: s.template.key,
      address: s.subdomains[0]?.subdomain ? `${s.subdomains[0].subdomain}` : null,
      ramMb: s.ramMb,
      cpuPercent: s.cpuPercent,
      diskMb: s.diskMb,
      isOwner: s.ownerId === user.id,
    })),
  );
});
