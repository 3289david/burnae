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
      <div style="background:#0f0f12;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
        <div style="max-width:480px;margin:0 auto;background:#17171c;border:1px solid #27272e;border-radius:16px;overflow:hidden">
          <div style="background:linear-gradient(135deg,#ff6b35,#ff8f5c);padding:28px 32px">
            <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.02em">🔥 Burnae</span>
          </div>
          <div style="padding:32px">
            <h1 style="color:#f5f5f7;font-size:20px;margin:0 0 12px">이메일 인증을 완료해주세요</h1>
            <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 24px">
              아래 버튼을 누르면 인증이 완료되고 바로 로그인돼요.<br/>
              이 링크는 ${VERIFICATION_TTL_HOURS}시간 동안만 유효해요.
            </p>
            <a href="${link}" style="display:inline-block;background:#ff6b35;color:#fff;font-size:15px;font-weight:600;padding:14px 28px;border-radius:10px;text-decoration:none">
              이메일 인증하기
            </a>
            <p style="color:#6b6b74;font-size:12px;line-height:1.6;margin:28px 0 0">
              버튼이 눌러지지 않으면 이 주소를 브라우저에 붙여넣어주세요:<br/>
              <a href="${link}" style="color:#ff8f5c;word-break:break-all">${link}</a>
            </p>
          </div>
          <div style="border-top:1px solid #27272e;padding:16px 32px;background:#131317">
            <p style="color:#6b6b74;font-size:11px;margin:0">
              이 메일이 스팸함에 들어가 있었다면, 다음부터는 스팸이 아님으로 표시해주세요.<br/>
              본인이 요청하지 않았다면 이 메일을 무시해도 괜찮아요.
            </p>
          </div>
        </div>
      </div>
    `,
  });
}
