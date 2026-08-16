import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { deleteServerFully } from "@/lib/provisioning";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
}

const deleteSchema = z.object({ createFinalBackup: z.boolean().default(true) });

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (server.ownerId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "서버 삭제 권한이 없습니다." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { createFinalBackup } = deleteSchema.parse(body);

  const result = await deleteServerFully(id, {
    createFinalBackup,
    requestedByUserId: user.id,
  });
  return NextResponse.json(result);
}
