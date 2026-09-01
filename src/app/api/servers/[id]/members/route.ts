import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { logServerActivity } from "@/lib/serverActivityLog";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });

  const [owner, members] = await Promise.all([
    prisma.user.findUnique({ where: { id: server.ownerId }, select: { id: true, name: true, email: true } }),
    prisma.serverMember.findMany({
      where: { serverId: id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { invitedAt: "asc" },
    }),
  ]);

  return NextResponse.json({ owner, members });
}

const schema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "MODERATOR", "DEVELOPER", "VIEWER"]),
});

/** 서버 소유자만 팀원을 초대할 수 있다. 초대받는 사람은 이미 Burnae 계정이 있어야 함 */
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
    return NextResponse.json({ error: "서버 소유자만 팀원을 초대할 수 있어요." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  const invitee = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!invitee) {
    return NextResponse.json(
      { error: "이 이메일로 가입된 Burnae 계정이 없어요. 먼저 회원가입을 해달라고 안내해주세요." },
      { status: 404 },
    );
  }
  if (invitee.id === server.ownerId) {
    return NextResponse.json({ error: "이미 이 서버의 소유자예요." }, { status: 409 });
  }

  const member = await prisma.serverMember.upsert({
    where: { serverId_userId: { serverId: id, userId: invitee.id } },
    update: { role: parsed.data.role },
    create: { serverId: id, userId: invitee.id, role: parsed.data.role },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "SERVER_MEMBER_INVITED",
      targetType: "Server",
      targetId: id,
      metadata: { invitee: invitee.email, role: parsed.data.role },
    },
  });

  await logServerActivity(id, user.id, "MEMBER_ADD", invitee.email);

  return NextResponse.json(member);
}
