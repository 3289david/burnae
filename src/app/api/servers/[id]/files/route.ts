import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { PteroClient } from "@/lib/pterodactyl";
import { withApiErrorHandling } from "@/lib/apiHandler";

export const GET = withApiErrorHandling(async (
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

  const dir = new URL(request.url).searchParams.get("dir") ?? "/";
  const files = await PteroClient.listFiles(server.pterodactylIdentifier, dir);
  // burnae-boot.sh가 컨테이너 루트에 만들어두는 내부 구현 파일들(SSH 비밀번호 등 민감한 것도
  // 있음) — 고객이 직접 건드릴 일이 없고 괜히 헷갈리기만 하니 파일 탭 목록에서는 숨긴다.
  // 루트 디렉터리에서만 숨기면 되고(이 파일들은 항상 /home/container 바로 아래에 생김),
  // 실제로 지우거나 수정하는 게 아니라 "목록에 안 보이게"만 하는 거라 안전하다.
  const visible = dir === "/" ? files.filter((f) => !HIDDEN_ROOT_FILES.has(f.name)) : files;
  return NextResponse.json(visible);
});

const HIDDEN_ROOT_FILES = new Set([
  "burnae-boot.sh",
  "burnae-sshd",
  ".burnae_ssh_pass",
  ".burnae_ssh_host_key",
  ".burnae_git.log",
  ".burnae_node_install.log",
  ".burnae_apt_setup.log",
  ".burnae_apt_setup_done",
]);
