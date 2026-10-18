import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { verifyCustomDomain, verifyHttpCustomDomain } from "@/lib/customDomain";
import { provisionCustomDomainSsl, revokeCustomDomainSsl } from "@/lib/customDomainSsl";

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

  if (domain.sslStatus === "ISSUED") {
    await revokeCustomDomainSsl(domain.hostname).catch((err) => {
      console.error(`[custom-domain] ${domain.hostname} SSL 해제 실패(도메인 레코드는 계속 삭제):`, err);
    });
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

  const result = domain.sslEligible
    ? await verifyHttpCustomDomain(domain.hostname, server.allocationIp)
    : await verifyCustomDomain(domain.hostname, { ip: server.allocationIp, port: server.allocationPort });

  let updated = await prisma.serverCustomDomain.update({
    where: { id: domainId },
    data: { verified: result.verified, lastCheckedAt: new Date() },
  });

  // HTTP 서비스 도메인이 방금 처음 확인됐고 아직 인증서가 없으면 바로 발급을 시도한다 —
  // 느리면 몇 초 걸리지만(certbot 검증 왕복), "확인하기" 버튼 한 번으로 바로 HTTPS까지 붙는
  // 경험이 중요해서 여기서 기다린다. 실패해도 유지보수 크론이 다음 주기에 재시도한다.
  if (result.verified && domain.sslEligible && updated.sslStatus !== "ISSUED") {
    const sslResult = await provisionCustomDomainSsl(domain.hostname, server.allocationIp, server.allocationPort);
    updated = await prisma.serverCustomDomain.update({
      where: { id: domainId },
      data: {
        sslStatus: sslResult.ok ? "ISSUED" : "FAILED",
        sslIssuedAt: sslResult.ok ? new Date() : undefined,
        sslError: sslResult.ok ? null : sslResult.error,
        sslLastAttemptAt: new Date(),
      },
    });
  }

  return NextResponse.json({ ...updated, reason: result.reason });
}
