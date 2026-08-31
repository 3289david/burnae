import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

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
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 422 });
  }

  const node = await prisma.hostNode.update({ where: { id }, data: parsed.data });
  return NextResponse.json(node);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
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
