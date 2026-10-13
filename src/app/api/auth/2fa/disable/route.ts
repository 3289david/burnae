import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { verifyTotp } from "@/lib/totp";
import { matchAndRemoveBackupCode } from "@/lib/password";
import { withApiErrorHandling } from "@/lib/apiHandler";

const schema = z.object({ code: z.string() });

/** 2단계 인증 끄기 — 계정 탈취 후 바로 꺼버리는 걸 막기 위해 현재 코드(또는 복구 코드)를 요구한다 */
export const POST = withApiErrorHandling(async (request: Request) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!user.twoFactorEnabled || !user.twoFactorSecret) {
    return NextResponse.json({ error: "2단계 인증이 켜져 있지 않아요." }, { status: 409 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "인증 코드를 입력해주세요." }, { status: 422 });

  const validTotp = verifyTotp(user.twoFactorSecret, parsed.data.code);
  if (!validTotp) {
    const remaining = await matchAndRemoveBackupCode(parsed.data.code, user.twoFactorBackupCodes);
    if (remaining === null) {
      return NextResponse.json({ error: "인증 코드가 올바르지 않아요." }, { status: 422 });
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: [] },
  });

  return NextResponse.json({ ok: true });
});
