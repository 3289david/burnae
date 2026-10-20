import type { UsageAccumulator } from "@/lib/ai/usageTracking";

/**
 * OpenRouter qwen/qwen3-235b-a22b-2507 실제 가격 (openrouter.ai/api/v1/models에서 직접 확인,
 * 2026-10 기준): prompt $0.00000009/토큰, completion $0.00000055/토큰.
 * 환율 변동과 OpenRouter의 provider 라우팅에 따른 가격 변화에 대비해 2배 안전 마진을 곱하고,
 * 원/달러 환율도 넉넉하게 잡아서 실제 비용보다 적게 청구되는 일이 없도록 한다.
 */
const FALLBACK_PROMPT_USD_PER_TOKEN = 0.00000009;
const FALLBACK_COMPLETION_USD_PER_TOKEN = 0.00000055;
const FALLBACK_SAFETY_MULTIPLIER = 2;
const WON_PER_USD = 1600;

/**
 * monken.cloud(기본 제공자, claude-opus-5-5 등)는 토큰당 단가를 API로 공개하지 않아서,
 * 운영 합의로 정한 원가 기준(100만 토큰당 1,000원, prompt/completion 구분 없음)에 마진을
 * 곱해서 고객 청구가로 쓴다 — 원가 그대로 받으면 마진이 전혀 없어서 안 된다.
 * 마진 비율이 바뀌면 PRIMARY_MARKUP_MULTIPLIER만 조정하면 된다.
 */
const PRIMARY_COST_KRW_PER_MILLION_TOKENS = 1000;
const PRIMARY_MARKUP_MULTIPLIER = 3;
const PRIMARY_KRW_PER_MILLION_TOKENS = PRIMARY_COST_KRW_PER_MILLION_TOKENS * PRIMARY_MARKUP_MULTIPLIER;

const KRW_PER_CREDIT = 40;

/** 실제 토큰 사용량 기반 청구 크레딧. 메시지 1개짜리 가벼운 턴도(사용량이 0이 아니면) 최소
 * 1크레딧은 낸다 — 제공자(primary/fallback)마다 단가가 달라서 섞여 쓰인 턴도 정확히 계산한다. */
export function creditsForUsage(usage: UsageAccumulator): number {
  const primaryTokens = usage.primary.promptTokens + usage.primary.completionTokens;
  const primaryKrw = (primaryTokens / 1_000_000) * PRIMARY_KRW_PER_MILLION_TOKENS;

  const fallbackUsd =
    usage.fallback.promptTokens * FALLBACK_PROMPT_USD_PER_TOKEN +
    usage.fallback.completionTokens * FALLBACK_COMPLETION_USD_PER_TOKEN;
  const fallbackKrw = fallbackUsd * WON_PER_USD * FALLBACK_SAFETY_MULTIPLIER;

  const totalKrw = primaryKrw + fallbackKrw;
  if (totalKrw <= 0) return 0;
  return Math.max(1, Math.ceil(totalKrw / KRW_PER_CREDIT));
}

export class InsufficientCreditsError extends Error {
  constructor() {
    super("이번 달 AI 사용 크레딧을 모두 썼어요. 다음 결제 갱신 때 다시 충전돼요.");
    this.name = "InsufficientCreditsError";
  }
}
