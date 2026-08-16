import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { PteroClient } from "@/lib/pterodactyl";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server || !server.pterodactylIdentifier) {
    return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  }

  const backups = await PteroClient.listBackups(server.pterodactylIdentifier);
  return NextResponse.json(backups);
}

const schema = z.object({ name: z.string().min(1).max(60).optional() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server || !server.pterodactylIdentifier) {
    return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  }

  const existing = await PteroClient.listBackups(server.pterodactylIdentifier);
  if (existing.length >= server.backupSlots) {
    return NextResponse.json(
      { error: `백업 슬롯이 가득 찼습니다 (최대 ${server.backupSlots}개). 기존 백업을 삭제해주세요.` },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const { name } = schema.parse(body);

  const backup = await PteroClient.createBackup(
    server.pterodactylIdentifier,
    name ?? `수동 백업 ${new Date().toLocaleString("ko-KR")}`,
  );
  return NextResponse.json(backup);
}
