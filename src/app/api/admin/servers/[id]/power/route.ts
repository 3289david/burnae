import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { PteroClient } from "@/lib/pterodactyl";

const schema = z.object({ signal: z.enum(["start", "stop", "restart", "kill"]) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const server = await prisma.server.findUniqueOrThrow({ where: { id } });
  if (!server.pterodactylIdentifier) {
    return NextResponse.json({ error: "서버가 아직 준비 중입니다." }, { status: 409 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  await PteroClient.sendPowerAction(server.pterodactylIdentifier, parsed.data.signal);
  return NextResponse.json({ ok: true });
}
