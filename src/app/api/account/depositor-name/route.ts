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
  // 다른 유저가 이미 쓰는 입금자명과 같으면 은행 입금 자동 매칭 시 서로 뒤바뀔 수 있어 막는다
  if (depositorName !== null) {
    const conflict = await prisma.user.findFirst({
      where: { preferredDepositorName: depositorName, id: { not: user.id } },
      select: { id: true },
    });
    if (conflict) {
      return NextResponse.json({ error: "이미 다른 유저가 쓰고 있는 입금자명이에요. 다른 이름을 입력해주세요." }, { status: 409 });
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { preferredDepositorName: depositorName },
  });
  return NextResponse.json({ ok: true, depositorName });
}
