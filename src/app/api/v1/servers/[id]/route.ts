import { NextResponse } from "next/server";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { requireApiUser } from "@/lib/apiAuth";
import { withApiErrorHandling } from "@/lib/apiHandler";
import { prisma } from "@/lib/prisma";

export const GET = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireApiUser(request);
  if (!user) return NextResponse.json({ error: "유효하지 않은 토큰이에요." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });

  const subdomain = await prisma.serverSubdomain.findFirst({ where: { serverId: id, isPrimary: true } });

  return NextResponse.json({
    id: server.id,
    name: server.name,
    status: server.status,
    address: subdomain?.subdomain ?? null,
    ramMb: server.ramMb,
    cpuPercent: server.cpuPercent,
    diskMb: server.diskMb,
    isOwner: server.ownerId === user.id,
    createdAt: server.createdAt,
  });
});
