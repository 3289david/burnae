import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { withApiErrorHandling } from "@/lib/apiHandler";
import { prisma } from "@/lib/prisma";
import { changeGitRemote, embedGitToken, supportsGitDeploy } from "@/lib/deploy";

const schema = z.object({
  url: z.string().url().max(300),
  token: z.string().max(300).optional(),
  useConnectedGithub: z.boolean().optional(),
});

/**
 * 기존 서버 파일을 그대로 두고 연결된 저장소만 바꾼다(StartupVariablesCard의 "저장소에서
 * 설치하기"는 전체 재설치라 파일이 거의 다 사라진다 — 이건 그것과 다르게 가벼운 전환).
 * 비공개 저장소면 token을 받아 주소에 바로 끼워 넣는다 — 소유자만 할 수 있다(저장소를 바꾸는
 * 건 실행 중인 코드 자체를 바꾸는 일이라 팀 멤버에게는 안 넘긴다).
 */
export const PATCH = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (server.ownerId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "서버 소유자만 바꿀 수 있어요." }, { status: 403 });
  }
  if (!(await supportsGitDeploy(server.templateId))) {
    return NextResponse.json({ error: "이 서버 종류는 저장소 연결을 지원하지 않아요." }, { status: 409 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "저장소 주소를 확인해주세요." }, { status: 422 });
  if (!parsed.data.url.startsWith("https://")) {
    return NextResponse.json({ error: "https:// 로 시작하는 주소만 쓸 수 있어요." }, { status: 422 });
  }

  let token = parsed.data.token;
  if (parsed.data.useConnectedGithub) {
    const connection = await prisma.gitHubConnection.findUnique({ where: { userId: user.id } });
    if (!connection) return NextResponse.json({ error: "GitHub 연동이 필요해요." }, { status: 409 });
    token = connection.accessToken;
  }

  const address = token ? embedGitToken(parsed.data.url, token) : parsed.data.url;
  const result = await changeGitRemote(server, address, user.id);
  return NextResponse.json(result);
});
