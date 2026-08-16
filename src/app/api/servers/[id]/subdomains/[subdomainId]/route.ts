import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { removeSubdomain } from "@/lib/provisioning";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; subdomainId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id, subdomainId } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (server.ownerId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const subdomain = await prisma.serverSubdomain.findUnique({ where: { id: subdomainId } });
  if (!subdomain || subdomain.serverId !== id) {
    return NextResponse.json({ error: "서브도메인을 찾을 수 없습니다." }, { status: 404 });
  }

  await removeSubdomain(subdomainId);
  return NextResponse.json({ ok: true });
}
