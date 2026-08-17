import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { PteroApp } from "@/lib/pterodactyl";

const schema = z.object({ suspended: z.boolean(), reason: z.string().max(200).optional() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const server = await prisma.server.findUniqueOrThrow({ where: { id } });
  if (!server.pterodactylServerId) {
    return NextResponse.json({ error: "서버가 아직 준비 중입니다." }, { status: 409 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  if (parsed.data.suspended) {
    await PteroApp.suspendServer(server.pterodactylServerId);
    await prisma.server.update({
      where: { id },
      data: { status: "SUSPENDED", suspendedReason: parsed.data.reason ?? "관리자에 의해 정지됨" },
    });
  } else {
    await PteroApp.unsuspendServer(server.pterodactylServerId);
    await prisma.server.update({ where: { id }, data: { status: "STOPPED", suspendedReason: null } });
  }

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: parsed.data.suspended ? "SERVER_SUSPENDED_BY_ADMIN" : "SERVER_UNSUSPENDED_BY_ADMIN",
      targetType: "Server",
      targetId: id,
      metadata: { reason: parsed.data.reason },
    },
  });

  return NextResponse.json({ ok: true });
}
