import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { PteroClient } from "@/lib/pterodactyl";
import { withApiErrorHandling } from "@/lib/apiHandler";
import { supportsSsh } from "@/lib/sshSupport";
import { prisma } from "@/lib/prisma";

/** burnae-sshd 바이너리 + 비밀번호/호스트키 파일 + 부트 스크립트 — 우리가 SSH 지원을 위해
 * 서버에 몰래 깔아두는 고정 크기 파일들. 고객이 올린 게 아니니 디스크 사용량에서 빼준다. */
const SSH_SIDECAR_OVERHEAD_BYTES = 4_565_000;

export const GET = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (!server.pterodactylIdentifier) {
    return NextResponse.json({
      current_state: "offline",
      is_suspended: false,
      resources: {
        memory_bytes: 0, cpu_absolute: 0, disk_bytes: 0,
        network_rx_bytes: 0, network_tx_bytes: 0, uptime: 0,
      },
    });
  }

  const resources = await PteroClient.getServerResources(server.pterodactylIdentifier);
  const template = await prisma.serverTemplate.findUnique({ where: { id: server.templateId }, select: { key: true } });
  if (template && supportsSsh(template.key) && server.accessSecret) {
    resources.resources.disk_bytes = Math.max(0, resources.resources.disk_bytes - SSH_SIDECAR_OVERHEAD_BYTES);
  }
  return NextResponse.json(resources);
});
