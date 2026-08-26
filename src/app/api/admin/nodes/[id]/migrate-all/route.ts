import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { migrateServerToNode } from "@/lib/serverMigration";

const schema = z.object({ targetNodeId: z.string().min(1) });

/**
 * 노드를 통째로 비울 때 쓴다 — 그 노드에 있는 활성 서버 전부를 대상 노드로 순서대로 이전한다.
 * 서버 하나씩 옮기는 /api/admin/servers/[id]/migrate 를 반복 호출하는 것과 같지만, 관리자가
 * 서버를 하나하나 고를 필요가 없다. 대역폭 부담을 줄이려 동시에 여러 개를 옮기지 않고 순서대로 처리한다.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "대상 노드를 선택해주세요." }, { status: 422 });
  }
  if (parsed.data.targetNodeId === id) {
    return NextResponse.json({ error: "같은 노드로는 이전할 수 없어요." }, { status: 422 });
  }

  const servers = await prisma.server.findMany({
    where: { nodeId: id, deletedAt: null, status: { not: "MIGRATING" }, pterodactylIdentifier: { not: null } },
    select: { id: true, name: true },
  });
  if (servers.length === 0) {
    return NextResponse.json({ error: "이 노드에 이전할 서버가 없어요." }, { status: 404 });
  }

  (async () => {
    for (const server of servers) {
      try {
        await migrateServerToNode(server.id, parsed.data.targetNodeId, admin.id);
        console.log(`[nodes/migrate-all] ${server.name} 이전 완료`);
      } catch (err) {
        console.error(`[nodes/migrate-all] ${server.name} 이전 실패:`, err);
      }
    }
  })();

  return NextResponse.json(
    { ok: true, message: `${servers.length}개 서버 이전을 시작했어요. 순서대로 진행되니 시간이 걸려요.` },
    { status: 202 },
  );
}
