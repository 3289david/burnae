import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSessionCookie } from "@/lib/auth";
import { siteUrl } from "@/lib/oauth";
import { localizedPath } from "@/lib/localeFromRequest";

/**
 * 인증 메일의 버튼/링크를 클릭하면 호출된다 — 인증을 완료하고 바로 로그인시킨다.
 *
 * 토큰을 쓰자마자 지우지 않는다 — 많은 메일 서비스(지메일/네이버 등)가 피싱 방지용으로
 * 메일 속 링크를 사람이 클릭하기 전에 미리 한 번 자동으로 열어보는데(보안 스캐너 사전 요청),
 * 그게 토큰을 먼저 "써버리면" 실제 사용자가 눌렀을 때 "이미 사용됨" 에러가 뜨는 흔한 버그가
 * 생긴다. 토큰은 만료 시간(expiresAt)으로만 유효성을 판단하고, 그 안에서는 몇 번을 눌러도
 * 같은 결과(인증+로그인)가 나오게 한다 — 만료 전까지 재사용 가능한 링크 자체의 위험은
 * 기존에도 동일했으므로(24시간짜리 베어러 토큰) 보안적으로 더 나빠지는 건 아니다.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const locale = (await cookies()).get("NEXT_LOCALE")?.value;
  const loginError = (message: string) =>
    NextResponse.redirect(new URL(`${localizedPath(locale, "/login")}?error=${encodeURIComponent(message)}`, siteUrl()));

  if (!token) return loginError("인증 링크가 올바르지 않습니다.");

  const pending = await prisma.emailVerificationToken.findUnique({ where: { token } });
  if (!pending) return loginError("인증 링크가 올바르지 않거나 만료됐어요. 로그인 화면에서 인증 메일을 다시 받아주세요.");
  if (pending.expiresAt < new Date()) {
    await prisma.emailVerificationToken.delete({ where: { token } }).catch(() => {});
    return loginError("인증 링크가 만료됐어요. 로그인 화면에서 인증 메일을 다시 받아주세요.");
  }

  const user = await prisma.user.update({
    where: { id: pending.userId },
    data: { emailVerifiedAt: new Date() },
  });

  if (user.status !== "ACTIVE") return loginError("정지된 계정입니다. 고객센터에 문의해주세요.");

  await createSessionCookie({ sub: user.id, role: user.role, email: user.email });
  return NextResponse.redirect(new URL(`${localizedPath(locale, "/dashboard")}?emailVerified=1`, siteUrl()));
}
