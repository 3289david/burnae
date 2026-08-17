import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { verifyCustomDomain } from "@/lib/customDomain";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; domainId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id, domainId } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (server.ownerId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const domain = await prisma.serverCustomDomain.findUnique({ where: { id: domainId } });
  if (!domain || domain.serverId !== id) {
    return NextResponse.json({ error: "도메인을 찾을 수 없습니다." }, { status: 404 });
  }

  await prisma.serverCustomDomain.delete({ where: { id: domainId } });
  return NextResponse.json({ ok: true });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; domainId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id, domainId } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (server.ownerId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  if (!server.allocationIp || !server.allocationPort) {
    return NextResponse.json({ error: "서버가 아직 준비 중입니다." }, { status: 409 });
  }

  const domain = await prisma.serverCustomDomain.findUnique({ where: { id: domainId } });
  if (!domain || domain.serverId !== id) {
    return NextResponse.json({ error: "도메인을 찾을 수 없습니다." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  if (body?.action !== "verify") {
    return NextResponse.json({ error: "지원하지 않는 요청이에요." }, { status: 400 });
  }

  const result = await verifyCustomDomain(domain.hostname, {
    ip: server.allocationIp,
    port: server.allocationPort,
  });

  const updated = await prisma.serverCustomDomain.update({
    where: { id: domainId },
    data: { verified: result.verified, lastCheckedAt: new Date() },
  });

  return NextResponse.json({ ...updated, reason: result.reason });
}
