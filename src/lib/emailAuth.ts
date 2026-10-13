import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { siteUrl } from "@/lib/oauth";

const VERIFICATION_TTL_HOURS = 24;
export const RESEND_COOLDOWN_SECONDS = 60;

/** 가입 시 1번만 필요한 이메일 인증 메일을 (재)발송한다 — 기존 토큰이 있으면 새 토큰으로 덮어쓴다 */
export async function sendVerificationEmail(userId: string, email: string): Promise<void> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000);

  await prisma.emailVerificationToken.upsert({
    where: { userId },
    update: { token, createdAt: new Date(), expiresAt },
    create: { userId, token, expiresAt },
  });

  const link = `${siteUrl()}/api/auth/email/verify?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Burnae 이메일 인증을 완료해주세요",
    html: `
      <div style="font-family:sans-serif;max-width:480px">
        <h2>Burnae 이메일 인증</h2>
        <p>아래 버튼을 눌러 이메일 인증을 완료하면 바로 로그인돼요. (${VERIFICATION_TTL_HOURS}시간 내에 유효)</p>
        <p><a href="${link}" style="display:inline-block;background:#ff6b35;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">이메일 인증하기</a></p>
        <p style="color:#888;font-size:12px">버튼이 안 눌러지면 이 링크를 브라우저에 붙여넣어주세요: ${link}</p>
      </div>
    `,
  });
}
