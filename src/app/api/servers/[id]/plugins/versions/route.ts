import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { getVersions, loaderForTemplateKey } from "@/lib/modrinth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const access = await authorizeServerAccess(user, id);
  if (!access) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });

  const server = await prisma.server.findUniqueOrThrow({ where: { id }, include: { template: true } });
  const loader = loaderForTemplateKey(server.template.key);
  if (!loader) return NextResponse.json({ error: "지원하지 않는 서버 종류입니다." }, { status: 422 });

  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId가 필요합니다." }, { status: 422 });

  const gameVersion = server.minecraftVersion && /^\d+\.\d+/.test(server.minecraftVersion) ? server.minecraftVersion : undefined;

  try {
    const versions = await getVersions({ projectId, loader, gameVersion });
    return NextResponse.json(versions);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "버전 조회 중 오류가 발생했습니다." },
      { status: 502 },
    );
  }
}
