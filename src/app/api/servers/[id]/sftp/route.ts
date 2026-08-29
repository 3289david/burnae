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
  return NextResponse.json({
    host: node.publicIp,
    port: node.sftpPort,
    username: `${panelUsernameForUser(owner.id)}.${server.pterodactylIdentifier}`,
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

  return NextResponse.json({ password: newPassword });
});
