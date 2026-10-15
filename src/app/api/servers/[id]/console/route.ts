import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess, getServerRole, hasServerRank } from "@/lib/serverAccess";
import { PteroClient } from "@/lib/pterodactyl";
import { withApiErrorHandling } from "@/lib/apiHandler";

const schema = z.object({ command: z.string().min(1).max(1000) });

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
  // 콘솔 명령은 사실상 서버 안에서 임의 명령을 실행하는 것과 같다(특히 셸 계열 템플릿) —
  // 보기만 하는 뷰어/중재자 역할은 보낼 수 없게 막는다.
  if (!hasServerRank(await getServerRole(user, server), "DEVELOPER")) {
    return NextResponse.json({ error: "콘솔 명령을 실행할 권한이 없어요." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "명령어를 입력해주세요." }, { status: 422 });
  }

  await PteroClient.sendConsoleCommand(server.pterodactylIdentifier, parsed.data.command);
  return NextResponse.json({ ok: true });
});
