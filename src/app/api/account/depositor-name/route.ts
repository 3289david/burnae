import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { isValidDepositorName, resolveDepositorName } from "@/lib/hanabank";

/** 결제 화면에서 "지금 쓸 입금자명"을 매번 미리 채워두기 위한 조회용 — 저장된 기본값이
 * 없으면 이름 기반으로 자동 생성되는 값을 그대로 보여준다(실제 주문 생성 시와 동일한 로직) */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  return NextResponse.json({ depositorName: resolveDepositorName(user) });
}

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
