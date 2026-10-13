import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { verifyTotp, generateBackupCodes } from "@/lib/totp";
import { hashPassword } from "@/lib/password";
import { withApiErrorHandling } from "@/lib/apiHandler";

const schema = z.object({ code: z.string() });

/** /api/auth/2fa/setup에서 받은 QR/비밀키로 인증기 앱에 등록한 뒤, 코드 1개를 확인받아 최종 활성화한다 */
export const POST = withApiErrorHandling(async (request: Request) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!user.twoFactorSecret) {
    return NextResponse.json({ error: "먼저 2단계 인증 설정을 시작해주세요." }, { status: 409 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !verifyTotp(user.twoFactorSecret, parsed.data.code)) {
    return NextResponse.json({ error: "인증 코드가 올바르지 않아요." }, { status: 422 });
  }

  const backupCodes = generateBackupCodes();
  const hashedCodes = await Promise.all(backupCodes.map((c) => hashPassword(c)));

  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: true, twoFactorBackupCodes: hashedCodes },
  });

  return NextResponse.json({ ok: true, backupCodes });
});
