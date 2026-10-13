import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSessionCookie } from "@/lib/auth";
import { verifyPassword, matchAndRemoveBackupCode } from "@/lib/password";
import { verifyTotp } from "@/lib/totp";
import { withApiErrorHandling } from "@/lib/apiHandler";

const schema = z.object({
  email: z.string().email(),
  password: z.string(),
  code: z.string().optional(),
});

export const POST = withApiErrorHandling(async (request: Request) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 422 });
  const { password, code } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "이메일 또는 비밀번호가 올바르지 않아요." }, { status: 401 });
  }
  if (user.status !== "ACTIVE") {
    return NextResponse.json({ error: "정지된 계정입니다. 고객센터에 문의해주세요." }, { status: 403 });
  }
  if (!user.emailVerifiedAt) {
    return NextResponse.json(
      { error: "이메일 인증이 아직 안 됐어요. 받은 메일함을 확인해주세요.", code: "EMAIL_NOT_VERIFIED" },
      { status: 403 },
    );
  }

  if (user.twoFactorEnabled) {
    if (!code) {
      return NextResponse.json({ requiresTwoFactor: true });
    }
    const validTotp = user.twoFactorSecret ? verifyTotp(user.twoFactorSecret, code) : false;
    if (!validTotp) {
      const remaining = await matchAndRemoveBackupCode(code, user.twoFactorBackupCodes);
      if (remaining === null) {
        return NextResponse.json({ error: "인증 코드가 올바르지 않아요.", requiresTwoFactor: true }, { status: 401 });
      }
      await prisma.user.update({ where: { id: user.id }, data: { twoFactorBackupCodes: remaining } });
    }
  }

  await createSessionCookie({ sub: user.id, role: user.role, email: user.email });
  return NextResponse.json({ ok: true });
});
