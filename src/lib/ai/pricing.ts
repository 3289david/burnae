/**
 * OpenRouter qwen/qwen3-235b-a22b-2507 실제 가격 (openrouter.ai/api/v1/models에서 직접 확인,
 * 2026-10 기준): prompt $0.00000009/토큰, completion $0.00000055/토큰.
 * 환율 변동과 OpenRouter의 provider 라우팅에 따른 가격 변화에 대비해 2배 안전 마진을 곱하고,
 * 원/달러 환율도 넉넉하게 잡아서 실제 비용보다 적게 청구되는 일이 없도록 한다.
 */
const PROMPT_USD_PER_TOKEN = 0.00000009;
const COMPLETION_USD_PER_TOKEN = 0.00000055;
const SAFETY_MULTIPLIER = 2;
const WON_PER_USD = 1600;
const KRW_PER_CREDIT = 40;

/** 실제 토큰 사용량 기반 청구 크레딧. 메시지 1개짜리 가벼운 턴도 최소 1크레딧은 낸다. */
export function creditsForUsage(promptTokens: number, completionTokens: number): number {
  const usd = promptTokens * PROMPT_USD_PER_TOKEN + completionTokens * COMPLETION_USD_PER_TOKEN;
  const krw = usd * WON_PER_USD * SAFETY_MULTIPLIER;
  return Math.max(1, Math.ceil(krw / KRW_PER_CREDIT));
}

export class InsufficientCreditsError extends Error {
  constructor() {
    super("이번 달 AI 사용 크레딧을 모두 썼어요. 다음 결제 갱신 때 다시 충전돼요.");
    this.name = "InsufficientCreditsError";
  }
}
