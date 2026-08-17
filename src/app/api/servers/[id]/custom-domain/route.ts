import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { isValidHostname } from "@/lib/customDomain";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });

  const domains = await prisma.serverCustomDomain.findMany({
    where: { serverId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(domains);
}

const schema = z.object({ hostname: z.string().min(1).max(253) });

/** 서버당 커스텀 도메인은 1개까지 — 여러 개를 지원할 근거가 없고 확인/관리가 번거로워짐 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (server.ownerId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  if (!server.allocationIp || !server.allocationPort) {
    return NextResponse.json({ error: "서버가 아직 준비 중입니다." }, { status: 409 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "도메인 주소를 입력해주세요." }, { status: 422 });
  }
  const hostname = parsed.data.hostname.trim().toLowerCase();
  if (!isValidHostname(hostname)) {
    return NextResponse.json({ error: "올바른 도메인 형식이 아니에요." }, { status: 422 });
  }

  const existingCount = await prisma.serverCustomDomain.count({ where: { serverId: id } });
  if (existingCount >= 1) {
    return NextResponse.json(
      { error: "서버당 커스텀 도메인은 1개까지 연결할 수 있어요." },
      { status: 409 },
    );
  }

  const dup = await prisma.serverCustomDomain.findUnique({ where: { hostname } });
  if (dup) {
    return NextResponse.json({ error: "이미 다른 서버에 연결된 도메인이에요." }, { status: 409 });
  }

  const created = await prisma.serverCustomDomain.create({
    data: { serverId: id, hostname },
  });
  return NextResponse.json({
    ...created,
    dnsInstructions: {
      srv: {
        name: `_minecraft._tcp.${hostname}`,
        type: "SRV",
        priority: 0,
        weight: 5,
        port: server.allocationPort,
        target: hostname,
      },
      a: { name: hostname, type: "A", value: server.allocationIp },
    },
  });
}
