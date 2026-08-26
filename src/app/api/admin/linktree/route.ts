import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { syncLinktreeMessage } from "@/lib/discordBoards";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const links = await prisma.linktreeLink.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json(links);
}

const schema = z.object({
  label: z.string().min(1).max(80),
  url: z.string().url(),
  emoji: z.string().max(8).optional().nullable(),
  sortOrder: z.number().int().default(0),
});

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." }, { status: 422 });
  }

  const link = await prisma.linktreeLink.create({ data: parsed.data });

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "LINKTREE_LINK_CREATED",
      targetType: "LinktreeLink",
      targetId: link.id,
      metadata: { label: link.label, url: link.url },
    },
  });

  await syncLinktreeMessage().catch((err) => console.error("[linktree] 디스코드 반영 실패:", err));

  return NextResponse.json(link);
}
