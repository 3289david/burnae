import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { PteroApp } from "@/lib/pterodactyl";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const nodes = await prisma.hostNode.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { servers: { where: { deletedAt: null } } } } },
  });

  const usage = await prisma.server.groupBy({
    by: ["nodeId"],
    where: { deletedAt: null },
    _sum: { ramMb: true, diskMb: true },
  });
  const usageMap = new Map(usage.map((u) => [u.nodeId, u._sum]));

  return NextResponse.json(
    nodes.map((n) => ({
      ...n,
      usedRamMb: usageMap.get(n.id)?.ramMb ?? 0,
      usedDiskMb: usageMap.get(n.id)?.diskMb ?? 0,
    })),
  );
}

const schema = z.object({
  pterodactylNodeId: z.number().int(),
  name: z.string().min(1),
  location: z.string().min(1),
  publicIp: z.string().min(1),
  reservedRamMb: z.number().int().min(0).default(0),
  reservedDiskMb: z.number().int().min(0).default(0),
  cpuCores: z.number().int().min(1),
});

/**
 * Pterodactyl에 이미 등록된 노드(Wings 설치 완료)를 Burnae 시스템에 연결한다.
 * fqdn/총 RAM/디스크는 Pterodactyl에서 실제 값을 가져온다 — 임의 입력 아님.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 422 });
  }
  const input = parsed.data;

  const pteroNodes = await PteroApp.listNodes();
  const pteroNode = pteroNodes.find((n) => n.id === input.pterodactylNodeId);
  if (!pteroNode) {
    return NextResponse.json(
      { error: "Pterodactyl에서 해당 노드를 찾을 수 없습니다. 노드 ID를 확인해주세요." },
      { status: 404 },
    );
  }

  const node = await prisma.hostNode.create({
    data: {
      pterodactylNodeId: pteroNode.id,
      name: input.name,
      location: input.location,
      fqdn: pteroNode.fqdn,
      publicIp: input.publicIp,
      totalRamMb: pteroNode.memory,
      totalDiskMb: pteroNode.disk,
      reservedRamMb: input.reservedRamMb,
      reservedDiskMb: input.reservedDiskMb,
      cpuCores: input.cpuCores,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "NODE_ADDED",
      targetType: "HostNode",
      targetId: node.id,
      metadata: { name: node.name },
    },
  });

  return NextResponse.json(node);
}
