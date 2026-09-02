import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { logServerActivity } from "@/lib/serverActivityLog";
import { withApiErrorHandling } from "@/lib/apiHandler";

const schema = z.object({ memberId: z.string() });

/**
 * 서버 소유권을 이미 팀원으로 참여 중인 사람에게 넘긴다. 처음 보는 유저에게 바로 넘기는 걸 막기 위해
 * 반드시 기존 팀원(ServerMember)만 대상으로 할 수 있다. 이전 소유자는 팀에서 빠지지 않고 관리자
 * 권한으로 남아 계속 접근할 수 있다 — 되돌릴 방법 없이 접근을 잃는 실수를 막기 위함.
 */
export const POST = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (server.ownerId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "서버 소유자만 소유권을 이전할 수 있어요." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  const member = await prisma.serverMember.findUnique({
    where: { id: parsed.data.memberId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!member || member.serverId !== id) {
    return NextResponse.json({ error: "팀원을 찾을 수 없습니다." }, { status: 404 });
  }

  const previousOwnerId = server.ownerId;
  await prisma.$transaction([
    prisma.serverMember.delete({ where: { id: member.id } }),
    prisma.server.update({ where: { id }, data: { ownerId: member.userId } }),
    prisma.serverMember.upsert({
      where: { serverId_userId: { serverId: id, userId: previousOwnerId } },
      update: { role: "ADMIN" },
      create: { serverId: id, userId: previousOwnerId, role: "ADMIN" },
    }),
  ]);

  await logServerActivity(id, user.id, "OWNER_TRANSFER", member.user.email);
  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "SERVER_OWNER_TRANSFERRED",
      targetType: "Server",
      targetId: id,
      metadata: { from: previousOwnerId, to: member.userId, toEmail: member.user.email },
    },
  });

  return NextResponse.json({ ok: true, newOwner: member.user });
});
