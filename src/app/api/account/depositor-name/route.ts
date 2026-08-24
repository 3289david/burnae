import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { isValidDepositorName } from "@/lib/hanabank";

const schema = z.object({ depositorName: z.string().min(1).max(5).nullable() });

export async function PATCH(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 422 });
  }
  const { depositorName } = parsed.data;
  if (depositorName !== null && !isValidDepositorName(depositorName)) {
    return NextResponse.json({ error: "입금자명은 공백 없이 1~5자여야 해요." }, { status: 422 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { preferredDepositorName: depositorName },
  });
  return NextResponse.json({ ok: true, depositorName });
}
