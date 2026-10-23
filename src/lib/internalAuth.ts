import crypto from "crypto";

/** ssh burnae.kr 게이트웨이 데몬(이 호스트에서 로컬로 호출)처럼, 외부가 아니라 우리 자신의
 * 서버 쪽 다른 프로세스가 호출하는 내부 API를 공유 비밀키로 보호한다. */
export function hasValidInternalSecret(request: Request): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    console.error("[internalAuth] INTERNAL_API_SECRET 환경변수가 설정되지 않았습니다.");
    return false;
  }
  const provided = request.headers.get("x-internal-secret") ?? "";
  const expected = Buffer.from(secret);
  const actual = Buffer.from(provided);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
