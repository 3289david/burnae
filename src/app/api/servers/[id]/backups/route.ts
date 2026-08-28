import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { PteroClient } from "@/lib/pterodactyl";
import { withApiErrorHandling } from "@/lib/apiHandler";

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

  const backups = await PteroClient.listBackups(server.pterodactylIdentifier);
  return NextResponse.json(backups);
});

const schema = z.object({ name: z.string().min(1).max(60).optional() });

export const POST = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
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
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  const backup = await PteroClient.createBackup(
    server.pterodactylIdentifier,
    parsed.data.name ?? `수동 백업 ${new Date().toLocaleString("ko-KR")}`,
  );
  return NextResponse.json(backup);
});
