import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveInitialRole } from "@/lib/auth";
import { hashPassword, isValidPassword } from "@/lib/password";
import { sendVerificationEmail } from "@/lib/emailAuth";
import { rewardReferralSignup } from "@/lib/promotions";
import { extractClientIp } from "@/lib/altAccountDetection";
import { withApiErrorHandling } from "@/lib/apiHandler";

const schema = z.object({
  email: z.string().email(),
  password: z.string(),
  name: z.string().min(1).max(20),
  referralCode: z.string().optional(),
});

export const POST = withApiErrorHandling(async (request: Request) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 422 });
  const { password, name, referralCode } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  if (!isValidPassword(password)) {
    return NextResponse.json({ error: "비밀번호는 8자 이상 72자 이하여야 해요." }, { status: 422 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  // 이미 비밀번호가 설정된(이메일로 가입을 마친) 계정이면 중복 가입을 막는다.
  // 소셜 로그인으로만 가입했던 계정(passwordHash 없음)이면, 같은 사람이 비밀번호 로그인도
  // 추가하는 것으로 보고 같은 계정에 비밀번호를 붙여준다 (oauth 콜백의 이메일 자동 연결과 동일한 원칙).
  if (existing?.passwordHash) {
    return NextResponse.json(
      { error: "이미 가입된 이메일이에요. 로그인해주세요." },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);
  let userId: string;

  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { passwordHash } });
    userId = existing.id;
  } else {
    const referrer = referralCode ? await prisma.user.findUnique({ where: { referralCode } }) : null;
    const user = await prisma.user.create({
      data: {
        email,
        name,
        role: resolveInitialRole(email),
        referredByUserId: referrer?.id,
        signupIp: extractClientIp(request),
        passwordHash,
      },
    });
    userId = user.id;
    if (referrer) {
      await rewardReferralSignup(referrer.id, user.id).catch((err) => {
        console.error("[email register] 추천 가입 포인트 지급 실패:", err);
      });
    }
  }

  await sendVerificationEmail(userId, email);

  return NextResponse.json({ ok: true });
});
