import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { searchProjects, loaderForTemplateKey } from "@/lib/modrinth";

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
  if (!loader) {
    return NextResponse.json(
      { error: "이 서버 종류(Vanilla 등)는 플러그인/모드를 지원하지 않아요." },
      { status: 422 },
    );
  }

  const query = new URL(request.url).searchParams.get("q") ?? "";
  if (query.trim().length === 0) {
    return NextResponse.json({ error: "검색어를 입력해주세요." }, { status: 422 });
  }

  try {
    const results = await searchProjects({ query, loader });
    return NextResponse.json({ loader, results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "검색 중 오류가 발생했습니다." },
      { status: 502 },
    );
  }
}
