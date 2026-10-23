import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hasValidInternalSecret } from "@/lib/internalAuth";

const schema = z.object({ code: z.string() });

/** ssh burnae.kr 게이트웨이 데몬이 비밀번호 자리에 입력된 코드를 확인할 때 부른다.
 * 성공하면 그 즉시 코드를 소모(usedAt 기록)한다 — 1회용이라 재사용 불가. */
export async function POST(request: Request) {
  if (!hasValidInternalSecret(request)) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  const record = await prisma.sshGatewayCode.findUnique({
    where: { code: parsed.data.code.trim().toUpperCase() },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json({ valid: false });
  }

  // 동시에 두 번 쓰려는 경쟁을 막기 위해 "아직 안 쓴 것만" 조건부로 소모 처리한다
  const claimed = await prisma.sshGatewayCode.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) return NextResponse.json({ valid: false });

  return NextResponse.json({ valid: true, userId: record.user.id, userName: record.user.name });
}
