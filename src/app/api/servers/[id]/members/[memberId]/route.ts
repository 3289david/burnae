import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { logServerActivity } from "@/lib/serverActivityLog";

const schema = z.object({ role: z.enum(["ADMIN", "MODERATOR", "DEVELOPER", "VIEWER"]) });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id, memberId } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (server.ownerId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "서버 소유자만 변경할 수 있어요." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  const member = await prisma.serverMember.findUnique({ where: { id: memberId } });
  if (!member || member.serverId !== id) {
    return NextResponse.json({ error: "팀원을 찾을 수 없습니다." }, { status: 404 });
  }

  const updated = await prisma.serverMember.update({
    where: { id: memberId },
    data: { role: parsed.data.role },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id, memberId } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });

  const member = await prisma.serverMember.findUnique({
    where: { id: memberId },
    include: { user: { select: { email: true } } },
  });
  if (!member || member.serverId !== id) {
    return NextResponse.json({ error: "팀원을 찾을 수 없습니다." }, { status: 404 });
  }

  const isOwner = server.ownerId === user.id || user.role === "ADMIN";
  const isSelf = member.userId === user.id;
  if (!isOwner && !isSelf) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  await prisma.serverMember.delete({ where: { id: memberId } });
  await logServerActivity(id, user.id, "MEMBER_REMOVE", member.user.email);
  return NextResponse.json({ ok: true });
}
