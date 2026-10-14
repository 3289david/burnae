import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail, RESEND_COOLDOWN_SECONDS } from "@/lib/emailAuth";
import { ResendError } from "@/lib/resend";
import { withApiErrorHandling } from "@/lib/apiHandler";

const schema = z.object({ email: z.string().email() });

export const POST = withApiErrorHandling(async (request: Request) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 422 });
  const email = parsed.data.email.toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
    include: { emailVerificationToken: true },
  });
  // 계정 존재 여부를 굳이 숨기지 않는다 — 가입 단계에서 이미 "이미 가입된 이메일" 같은 메시지를 보여주는 서비스라
  // 여기서만 숨기는 건 일관성이 없고, 사용자 입장에선 왜 메일이 안 오는지 알 방법이 없어진다.
  if (!user || !user.passwordHash) {
    return NextResponse.json({ error: "가입된 이메일 계정을 찾을 수 없어요." }, { status: 404 });
  }
  if (user.emailVerifiedAt) {
    return NextResponse.json({ error: "이미 인증이 완료된 계정이에요. 로그인해주세요." }, { status: 409 });
  }

  const lastSentAt = user.emailVerificationToken?.createdAt;
  if (lastSentAt && Date.now() - lastSentAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
    return NextResponse.json(
      { error: `너무 자주 요청했어요. ${RESEND_COOLDOWN_SECONDS}초 뒤에 다시 시도해주세요.` },
      { status: 429 },
    );
  }

  try {
    await sendVerificationEmail(user.id, email);
  } catch (err) {
    console.error("[resend-verification] 인증 메일 발송 실패:", err);
    const message = err instanceof ResendError ? err.message : "인증 메일 발송에 실패했어요.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
});
