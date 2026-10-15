import crypto from "crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { prisma } from "@/lib/prisma";
import { PteroApp } from "@/lib/pterodactyl";
import { panelUsernameForUser } from "@/lib/pterodactylUser";
import { withApiErrorHandling } from "@/lib/apiHandler";

async function loadOwnerAndNode(server: { ownerId: string; nodeId: string; pterodactylIdentifier: string | null }) {
  const [owner, node] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: server.ownerId } }),
    prisma.hostNode.findUniqueOrThrow({ where: { id: server.nodeId } }),
  ]);
  return { owner, node };
}

export const GET = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server || !server.pterodactylIdentifier) {
    return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  }
  if (server.ownerId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "서버 소유자만 확인할 수 있어요." }, { status: 403 });
  }

  const { owner, node } = await loadOwnerAndNode(server);

  // 패널 유저명은 항상 panelUsernameForUser 규칙대로 만들어지는 게 아니다(가입 전부터 있던 패널 계정을
  // findOrCreateUser가 이메일로 찾아 그대로 재사용하는 경우 유저명이 다를 수 있음) — 실제 패널 유저명을
  // 조회해서 써야 SFTP 로그인이 틀어지지 않는다.
  const panelUsername = owner.pterodactylUserId
    ? (await PteroApp.getUser(owner.pterodactylUserId)).username
    : panelUsernameForUser(owner.id);

  return NextResponse.json({
    host: node.sftpFqdn || node.fqdn,
    port: node.sftpPort,
    username: `${panelUsername}.${server.pterodactylIdentifier}`,
    hasPassword: !!owner.sftpPassword,
  });
});

export const POST = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server || !server.pterodactylIdentifier) {
    return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  }
  if (server.ownerId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "서버 소유자만 변경할 수 있어요." }, { status: 403 });
  }

  const { owner } = await loadOwnerAndNode(server);

  let pterodactylUserId = owner.pterodactylUserId;
  if (!pterodactylUserId) {
    const [firstName, ...rest] = owner.name.split(" ");
    const pteroUser = await PteroApp.findOrCreateUser({
      email: owner.email,
      username: panelUsernameForUser(owner.id),
      firstName: firstName || owner.name,
      lastName: rest.join(" ") || "Burnae",
    });
    pterodactylUserId = pteroUser.id;
  }

  const newPassword = crypto.randomBytes(12).toString("base64url");
  await PteroApp.resetUserPassword(pterodactylUserId, newPassword);
  await prisma.user.update({
    where: { id: owner.id },
    data: { pterodactylUserId, sftpPassword: newPassword },
  });

  // 소유자 본인이 아니라 관리자가 대신 재발급한 경우(지원 요청 처리 등)는 남이 쓰던 패널
  // 계정 비밀번호를 바꾼 셈이라 반드시 기록을 남긴다.
  if (user.id !== owner.id) {
    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "ADMIN_RESET_SFTP_PASSWORD",
        targetType: "User",
        targetId: owner.id,
        metadata: { serverId: server.id },
      },
    });
  }

  return NextResponse.json({ password: newPassword });
});
