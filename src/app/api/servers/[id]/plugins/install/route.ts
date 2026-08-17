import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { getVersionById, contentTypeForLoader, loaderForTemplateKey, downloadVersionFile } from "@/lib/modrinth";
import { PteroClient } from "@/lib/pterodactyl";

const schema = z.object({ versionId: z.string().min(1) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const access = await authorizeServerAccess(user, id);
  if (!access) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });

  const server = await prisma.server.findUniqueOrThrow({ where: { id }, include: { template: true } });
  if (!server.pterodactylIdentifier) {
    return NextResponse.json({ error: "서버가 아직 준비 중입니다." }, { status: 409 });
  }
  const loader = loaderForTemplateKey(server.template.key);
  if (!loader) return NextResponse.json({ error: "지원하지 않는 서버 종류입니다." }, { status: 422 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  try {
    const version = await getVersionById(parsed.data.versionId);
    if (!version.primaryFile) throw new Error("설치할 파일을 찾을 수 없습니다.");

    const bytes = await downloadVersionFile(version.primaryFile);
    const dir = contentTypeForLoader(loader) === "plugin" ? "/plugins" : "/mods";
    await PteroClient.writeBinaryFile(
      server.pterodactylIdentifier,
      `${dir}/${version.primaryFile.filename}`,
      bytes,
    );

    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "PLUGIN_INSTALLED",
        targetType: "Server",
        targetId: server.id,
        metadata: { filename: version.primaryFile.filename, versionId: version.id },
      },
    });

    return NextResponse.json({ ok: true, filename: version.primaryFile.filename, directory: dir });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "설치 중 오류가 발생했습니다." },
      { status: 502 },
    );
  }
}
