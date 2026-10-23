import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasValidInternalSecret } from "@/lib/internalAuth";

/** ssh burnae.kr 게이트웨이 데몬이 로그인한 유저의 서버 목록을 가져올 때 부른다 —
 * 소유한 서버만 보여준다(팀원 초대 서버는 메뉴 복잡도를 늘리니 1차는 제외). */
export async function GET(request: Request) {
  if (!hasValidInternalSecret(request)) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId가 필요합니다." }, { status: 422 });

  const servers = await prisma.server.findMany({
    where: { ownerId: userId, deletedAt: null },
    select: { id: true, name: true, status: true, pterodactylIdentifier: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(
    servers.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      canControl: !!s.pterodactylIdentifier,
    })),
  );
}
