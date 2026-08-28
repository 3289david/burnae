import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { contentTypeForLoader, loaderForTemplateKey } from "@/lib/modrinth";
import { PteroClient } from "@/lib/pterodactyl";
import { withApiErrorHandling } from "@/lib/apiHandler";

async function resolveDir(id: string) {
  const server = await prisma.server.findUniqueOrThrow({ where: { id }, include: { template: true } });
  const loader = loaderForTemplateKey(server.template.key);
  const dir = loader ? (contentTypeForLoader(loader) === "plugin" ? "/plugins" : "/mods") : null;
  return { server, dir };
}

export const GET = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const access = await authorizeServerAccess(user, id);
  if (!access) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });

  const { server, dir } = await resolveDir(id);
  if (!dir || !server.pterodactylIdentifier) return NextResponse.json({ dir: null, files: [] });

  try {
    const files = await PteroClient.listFiles(server.pterodactylIdentifier, dir);
    return NextResponse.json({ dir, files: files.filter((f) => f.is_file && f.name.endsWith(".jar")) });
  } catch {
    // plugins/mods 폴더가 아직 없는 서버(한 번도 설치한 적 없음)
    return NextResponse.json({ dir, files: [] });
  }
});

const schema = z.object({ filename: z.string().min(1) });

export const DELETE = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const access = await authorizeServerAccess(user, id);
  if (!access) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });

  const { server, dir } = await resolveDir(id);
  if (!dir || !server.pterodactylIdentifier) {
    return NextResponse.json({ error: "지원하지 않는 서버입니다." }, { status: 422 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  await PteroClient.deleteFiles(server.pterodactylIdentifier, dir, [parsed.data.filename]);
  return NextResponse.json({ ok: true });
});
