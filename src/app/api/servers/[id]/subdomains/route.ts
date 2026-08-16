import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { provisionSubdomain, MAX_SUBDOMAINS_PER_SERVER, ProvisioningError } from "@/lib/provisioning";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });

  const subdomains = await prisma.serverSubdomain.findMany({
    where: { serverId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(subdomains);
}

const schema = z.object({ name: z.string().min(1).max(32) });

/** 소유자가 서버당 최대 2개까지 서브도메인을 추가할 수 있다 */
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

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "서브도메인 이름을 입력해주세요." }, { status: 422 });

  const count = await prisma.serverSubdomain.count({ where: { serverId: id } });
  if (count >= MAX_SUBDOMAINS_PER_SERVER) {
    return NextResponse.json(
      { error: `서버당 서브도메인은 최대 ${MAX_SUBDOMAINS_PER_SERVER}개까지예요.` },
      { status: 409 },
    );
  }

  const node = await prisma.hostNode.findUniqueOrThrow({ where: { id: server.nodeId } });

  try {
    const created = await provisionSubdomain({
      server,
      node,
      desiredName: parsed.data.name,
      isPrimary: count === 0,
    });
    return NextResponse.json(created);
  } catch (err) {
    const message = err instanceof ProvisioningError ? err.message : "서브도메인 생성에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
