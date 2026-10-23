import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { PteroApp, PteroClient } from "@/lib/pterodactyl";
import { withApiErrorHandling } from "@/lib/apiHandler";

const schema = z.object({ enabled: z.boolean() });

/** 빈 서버(blank-server)의 기본 정적 파일 서버 on/off — 시작 명령어 문자열에 박아 넣은
 * STATIC_SERVER_ENABLED 값을 바꾸고, 재설치로 컨테이너를 다시 만들어서 바로 적용한다. */
export const PATCH = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (server.ownerId !== user.id) {
    return NextResponse.json({ error: "서버 소유자만 바꿀 수 있어요." }, { status: 403 });
  }
  if (!server.pterodactylServerId || !server.pterodactylIdentifier) {
    return NextResponse.json({ error: "서버가 아직 준비 중입니다." }, { status: 409 });
  }

  const template = await prisma.serverTemplate.findUnique({ where: { id: server.templateId } });
  if (template?.key !== "blank-server") {
    return NextResponse.json({ error: "이 기능은 빈 서버에서만 켤 수 있어요." }, { status: 422 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });
  const { enabled } = parsed.data;

  const detail = await PteroApp.getServer(server.pterodactylServerId);
  const current = detail.container.startup_command;
  const nextValue = enabled ? "1" : "0";
  const nextStartup = /STATIC_SERVER_ENABLED=\d/.test(current)
    ? current.replace(/STATIC_SERVER_ENABLED=\d/, `STATIC_SERVER_ENABLED=${nextValue}`)
    : `export STATIC_SERVER_ENABLED=${nextValue}; ${current}`;

  await PteroApp.updateServerStartup(server.pterodactylServerId, {
    startupCommand: nextStartup,
    environment: detail.container.environment,
    eggId: detail.egg,
    dockerImage: detail.container.image,
    skipScripts: detail.container.skip_scripts,
  });

  await PteroClient.reinstallServer(server.pterodactylIdentifier);
  await prisma.server.update({ where: { id }, data: { staticFileServerEnabled: enabled } });

  return NextResponse.json({ ok: true, enabled });
});
