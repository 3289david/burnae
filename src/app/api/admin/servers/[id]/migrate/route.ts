import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { migrateServerToNode } from "@/lib/serverMigration";

const schema = z.object({ targetNodeId: z.string().min(1) });

/**
 * 노드 이전은 압축→다운로드→업로드→압축해제까지 몇 분씩 걸릴 수 있어, Nginx의 기본 프록시
 * 타임아웃(60초)에 걸리지 않도록 응답은 즉시 보내고 실제 작업은 뒤에서 계속 진행한다.
 * (Vercel 같은 서버리스가 아니라 systemd로 상시 떠 있는 Node 프로세스라 안전하다.)
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

  const server = await prisma.server.findUnique({ where: { id } });
  if (!server || server.deletedAt) {
    return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  }
  if (server.status === "MIGRATING") {
    return NextResponse.json({ error: "이미 이전이 진행 중입니다." }, { status: 409 });
  }

  migrateServerToNode(id, parsed.data.targetNodeId, admin.id).catch((err) => {
    console.error(`[admin/servers/${id}/migrate] 이전 실패:`, err);
  });

  return NextResponse.json(
    { ok: true, message: "이전을 시작했습니다. 완료까지 몇 분 정도 걸릴 수 있어요." },
    { status: 202 },
  );
}
