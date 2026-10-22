import type { UsageAccumulator } from "@/lib/ai/usageTracking";
import { AI_MODEL_CATALOG, type AiModelKey } from "@/lib/ai/models";

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
 * monken.cloud(기본 제공자)는 토큰당 단가를 API로 공개하지 않아서, 운영 합의로 정한 원가
 * 기준(Sonnet 100만 토큰당 1,000원, prompt/completion 구분 없음)에 마진을 곱해서 고객
 * 청구가로 쓴다. Opus/Haiku는 이 Sonnet 단가에 models.ts의 priceMultiplier를 곱한
 * 상대값이다(Opus 1.5배, Haiku 0.8배) — 마진 비율이나 모델별 배율이 바뀌면 이 두 상수만
 * 조정하면 된다.
 */
const SONNET_COST_KRW_PER_MILLION_TOKENS = 1000;
const MARKUP_MULTIPLIER = 3;
const SONNET_KRW_PER_MILLION_TOKENS = SONNET_COST_KRW_PER_MILLION_TOKENS * MARKUP_MULTIPLIER;

const KRW_PER_CREDIT = 40;

/** 실제 토큰 사용량 기반 청구 크레딧 — 소수점을 허용한다(Haiku 같은 저가 모델은 가벼운 턴이
 * 1크레딧도 안 될 수 있음). 모델/제공자마다 단가가 달라서 섞여 쓰인 턴도 정확히 계산한다. */
export function creditsForUsage(usage: UsageAccumulator): number {
  let totalKrw = 0;

  for (const key of Object.keys(AI_MODEL_CATALOG) as AiModelKey[]) {
    const bucket = usage[key];
    const tokens = bucket.promptTokens + bucket.completionTokens;
    const krwPerMillion = SONNET_KRW_PER_MILLION_TOKENS * AI_MODEL_CATALOG[key].priceMultiplier;
    totalKrw += (tokens / 1_000_000) * krwPerMillion;
  }

  const fallbackUsd =
    usage.fallback.promptTokens * FALLBACK_PROMPT_USD_PER_TOKEN +
    usage.fallback.completionTokens * FALLBACK_COMPLETION_USD_PER_TOKEN;
  totalKrw += fallbackUsd * WON_PER_USD * FALLBACK_SAFETY_MULTIPLIER;

  if (totalKrw <= 0) return 0;
  return Math.round((totalKrw / KRW_PER_CREDIT) * 100) / 100;
}

export class InsufficientCreditsError extends Error {
  constructor() {
    super("이번 달 AI 사용 크레딧을 모두 썼어요. 다음 결제 갱신 때 다시 충전돼요.");
    this.name = "InsufficientCreditsError";
  }
}
