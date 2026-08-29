import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { deleteServerFully } from "@/lib/provisioning";
import { prisma } from "@/lib/prisma";
import { PteroApp } from "@/lib/pterodactyl";
import { withApiErrorHandling } from "@/lib/apiHandler";

export const GET = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });

  const full = await prisma.server.findUnique({
    where: { id },
    include: { template: true, product: true, node: { select: { name: true, location: true } } },
  });
  return NextResponse.json(full);
});

const renameSchema = z.object({ name: z.string().min(2).max(24) });

export const PATCH = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (server.ownerId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "서버 소유자만 이름을 바꿀 수 있어요." }, { status: 403 });
  }

  const parsed = renameSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "이름은 2~24자로 입력해주세요." }, { status: 422 });

  if (server.pterodactylServerId) {
    await PteroApp.renameServer(server.pterodactylServerId, parsed.data.name);
  }
  await prisma.server.update({ where: { id }, data: { name: parsed.data.name } });

  return NextResponse.json({ ok: true, name: parsed.data.name });
});

const deleteSchema = z.object({ createFinalBackup: z.boolean().default(true) });

export const DELETE = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (server.ownerId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "서버 삭제 권한이 없습니다." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  const result = await deleteServerFully(id, {
    createFinalBackup: parsed.data.createFinalBackup,
    requestedByUserId: user.id,
  });
  return NextResponse.json(result);
});
