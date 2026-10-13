/**
 * OCTOMO(octomo.octoverse.kr) 문자 발신(MO) 인증 — 일반적인 SMS 발송 인증과 반대로, 유저가
 * 자기 휴대폰에서 OCTOMO 대표번호(1666-3538)로 지정된 코드를 "보내면", 그 문자가 실제로
 * 도착했는지를 이 API로 조회해서 본인 명의 휴대폰 소유를 확인한다. 발신 비용이 유저에게
 * 생기지만(문자 1건), 우리 쪽 SMS 발송 비용은 0원이라 "무료" 인증 API로 제공된다.
 */

const OCTOMO_BASE = "https://api.octoverse.kr/octomo/v1/public";
export const OCTOMO_TARGET_NUMBER = "1666-3538";

export class OctomoError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "OctomoError";
  }
}

function headers() {
  const apiKey = process.env.OCTOMO_API_KEY;
  if (!apiKey) throw new Error("OCTOMO_API_KEY 환경변수가 설정되지 않았습니다.");
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Octomo ${apiKey}`,
  };
}

/** mobileNum(010으로 시작하는 11자리)으로 text 문자가 최근 withinMinutes(기본 5, 최대 60)분 내에 왔는지 확인 */
export async function checkMessageExists(
  mobileNum: string,
  text: string,
  withinMinutes?: number,
): Promise<boolean> {
  const res = await fetch(`${OCTOMO_BASE}/message/exists`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ mobileNum, text, ...(withinMinutes ? { withinMinutes } : {}) }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new OctomoError(body?.message ?? `OCTOMO API 오류 (${res.status})`, res.status);
  }
  return body?.exists === true;
}

export function isValidKoreanMobileNumber(value: string): boolean {
  return /^010\d{8}$/.test(value);
}
