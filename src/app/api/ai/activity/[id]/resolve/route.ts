import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { resolveAiActivity } from "@/lib/ai/engine";

const schema = z.object({ decision: z.enum(["APPROVE", "REJECT"]) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const activity = await prisma.aiActivityLog.findUnique({ where: { id } });
  if (!activity || activity.userId !== user.id) {
    return NextResponse.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청" }, { status: 422 });

  const result = await resolveAiActivity(id, parsed.data.decision);
  return NextResponse.json(result);
}
