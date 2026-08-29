import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { PteroApp } from "@/lib/pterodactyl";
import { withApiErrorHandling } from "@/lib/apiHandler";

async function loadServerWithNode(id: string) {
  const server = await prisma.server.findUnique({ where: { id } });
  if (!server || !server.pterodactylServerId) return null;
  const node = await prisma.hostNode.findUniqueOrThrow({ where: { id: server.nodeId } });
  return { server, node };
}

/** 노드의 포트가 사용 중인지 비어있는지, 이 서버가 쓰는 포트인지 확인해서 보여준다 */
export const GET = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const loaded = await loadServerWithNode(id);
  if (!loaded) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  const { server, node } = loaded;

  const allocations = await PteroApp.listNodeAllocations(node.pterodactylNodeId);
  return NextResponse.json(
    allocations.map((a) => ({
      id: a.id,
      ip: a.ip,
      port: a.port,
      isDefault: a.port === server.allocationPort && a.ip === server.allocationIp,
      inUseByThisServer: a.assignedServerId === server.pterodactylServerId,
      inUse: a.assigned,
      usedBy: a.assignedServerName,
    })),
  );
});

const addSchema = z.union([
  z.object({ allocationId: z.number().int() }),
  z.object({ newPort: z.number().int().min(1024).max(65535) }),
]);

export const POST = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const loaded = await loadServerWithNode(id);
  if (!loaded) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  const { server, node } = loaded;

  const parsed = addSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  let allocationId: number;
  if ("allocationId" in parsed.data) {
    allocationId = parsed.data.allocationId;
  } else {
    const newPort = parsed.data.newPort;
    await PteroApp.createNodeAllocation(node.pterodactylNodeId, node.publicIp, newPort);
    const allocations = await PteroApp.listNodeAllocations(node.pterodactylNodeId);
    const created = allocations.find((a) => a.ip === node.publicIp && a.port === newPort);
    if (!created) return NextResponse.json({ error: "포트 생성에 실패했습니다." }, { status: 500 });
    allocationId = created.id;
  }

  await PteroApp.addServerAllocation(server.pterodactylServerId!, allocationId);
  return NextResponse.json({ ok: true });
});

const removeSchema = z.object({ allocationId: z.number().int() });

export const DELETE = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const loaded = await loadServerWithNode(id);
  if (!loaded) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  const { server } = loaded;

  const parsed = removeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  await PteroApp.removeServerAllocation(server.pterodactylServerId!, parsed.data.allocationId);
  return NextResponse.json({ ok: true });
});
