import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/auth";
import { sendDiscordChannelMessage } from "@/lib/discordNotify";
import { panel, heading, text, COMPONENTS_V2_FLAG } from "@/lib/discordComponentsV2";

const NODE_STATUS_LABEL: Record<string, string> = {
  ONLINE: "🟢 정상 운영 중",
  OFFLINE: "🔴 장애/점검으로 중단",
  MAINTENANCE: "🟡 점검 중",
};

/** 관리자가 노드 상태를 바꾸면 고객들이 바로 알 수 있게 공지 채널에 투명하게 알린다 —
 * 장애를 숨기지 않고 바로 알리는 쪽이 신뢰를 쌓는다는 판단 */
async function announceNodeStatusChange(nodeName: string, nodeLocation: string, status: string) {
  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });
  if (!settings?.announcementChannelId) return;

  const container = panel(status === "ONLINE" ? 0x22c55e : 0xef4444)
    .addTextDisplayComponents(heading(`노드 상태 변경: ${nodeName} (${nodeLocation})`))
    .addTextDisplayComponents(text(NODE_STATUS_LABEL[status] ?? status));

  await sendDiscordChannelMessage(settings.announcementChannelId, {
    components: [container.toJSON()],
    flags: COMPONENTS_V2_FLAG,
  }).catch((err) => console.error("[admin/nodes] 노드 상태 공지 실패:", err));
}

const schema = z.object({
  name: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  publicIp: z.string().min(1).optional(),
  sftpFqdn: z.string().max(255).nullable().optional(),
  reservedRamMb: z.number().int().min(0).optional(),
  reservedDiskMb: z.number().int().min(0).optional(),
  cpuCores: z.number().int().min(1).optional(),
  sftpPort: z.number().int().min(1).max(65535).optional(),
  status: z.enum(["ONLINE", "OFFLINE", "MAINTENANCE"]).optional(),
  autoDeployEnabled: z.boolean().optional(),
  /// 이 이메일의 유저에게 노드를 통째로 전용 배정한다. 빈 문자열/null이면 배정 해제
  dedicatedToUserEmail: z.string().nullable().optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminRole(["GENERAL", "SUPER"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 422 });
  }
  const { dedicatedToUserEmail, ...data } = parsed.data;

  let dedicatedToUserId: string | null | undefined = undefined;
  if (dedicatedToUserEmail !== undefined) {
    if (!dedicatedToUserEmail) {
      dedicatedToUserId = null;
    } else {
      const target = await prisma.user.findUnique({ where: { email: dedicatedToUserEmail.toLowerCase() } });
      if (!target) return NextResponse.json({ error: "해당 이메일의 유저를 찾을 수 없어요." }, { status: 404 });
      dedicatedToUserId = target.id;
    }
  }

  const before = data.status ? await prisma.hostNode.findUnique({ where: { id }, select: { status: true } }) : null;

  const node = await prisma.hostNode.update({
    where: { id },
    data: { ...data, ...(dedicatedToUserId !== undefined ? { dedicatedToUserId } : {}) },
  });

  if (data.status && before && before.status !== data.status) {
    announceNodeStatusChange(node.name, node.location, data.status).catch(() => {});
  }

  return NextResponse.json(node);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminRole(["GENERAL", "SUPER"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const activeServers = await prisma.server.count({ where: { nodeId: id, deletedAt: null } });
  if (activeServers > 0) {
    return NextResponse.json(
      { error: `이 노드에 아직 ${activeServers}개의 서버가 있어 삭제할 수 없습니다.` },
      { status: 409 },
    );
  }
  await prisma.hostNode.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
