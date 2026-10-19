import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withApiErrorHandling } from "@/lib/apiHandler";
import { fetchGithubRepos } from "@/lib/githubConnect";

/** 연동된 GitHub 계정의 저장소 목록(비공개 포함) — Git 배포 저장소 선택용 */
export const GET = withApiErrorHandling(async () => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const connection = await prisma.gitHubConnection.findUnique({ where: { userId: user.id } });
  if (!connection) return NextResponse.json({ error: "GitHub 연동이 필요해요." }, { status: 409 });

  const repos = await fetchGithubRepos(connection.accessToken);
  return NextResponse.json({ githubLogin: connection.githubLogin, repos });
});

export const DELETE = withApiErrorHandling(async () => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  await prisma.gitHubConnection.delete({ where: { userId: user.id } }).catch(() => {});
  return NextResponse.json({ ok: true });
});
