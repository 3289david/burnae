import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionCookie } from "@/lib/auth";
import { siteUrl } from "@/lib/oauth";

/** 인증 메일의 버튼/링크를 클릭하면 호출된다 — 인증을 완료하고 바로 로그인시킨다 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const loginError = (message: string) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, siteUrl()));

  if (!token) return loginError("인증 링크가 올바르지 않습니다.");

  const pending = await prisma.emailVerificationToken.findUnique({ where: { token } });
  if (!pending) return loginError("인증 링크가 올바르지 않거나 이미 사용됐습니다.");
  if (pending.expiresAt < new Date()) {
    await prisma.emailVerificationToken.delete({ where: { token } }).catch(() => {});
    return loginError("인증 링크가 만료됐어요. 로그인 화면에서 인증 메일을 다시 받아주세요.");
  }

  const user = await prisma.user.update({
    where: { id: pending.userId },
    data: { emailVerifiedAt: new Date() },
  });
  await prisma.emailVerificationToken.delete({ where: { token } }).catch(() => {});

  if (user.status !== "ACTIVE") return loginError("정지된 계정입니다. 고객센터에 문의해주세요.");

  await createSessionCookie({ sub: user.id, role: user.role, email: user.email });
  return NextResponse.redirect(new URL("/dashboard?emailVerified=1", siteUrl()));
}
