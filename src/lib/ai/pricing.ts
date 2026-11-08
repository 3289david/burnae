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
 * opus/sonnet/haiku 버킷은 과거 monken.cloud(토큰당 단가를 API로 공개하지 않던 제공자) 호출
 * 분의 과금용이었다 — 운영 합의로 정한 원가 기준(Sonnet 100만 토큰당 1,000원, prompt/completion
 * 구분 없음)에 마진을 곱해서 고객 청구가로 썼고, Opus/Haiku는 이 Sonnet 단가에 models.ts의
 * priceMultiplier를 곱한 상대값이었다(Opus 1.5배, Haiku 0.8배). 지금은 모든 호출이 OpenRouter
 * fallback 버킷으로만 기록되니(provider.ts) 이 버킷들은 항상 0이지만, 계산 로직은 그대로 둬도
 * 안전하다 — 과거 기록이 섞인 대화의 과금 재계산에도 쓸 수 있다.
 */
const SONNET_COST_KRW_PER_MILLION_TOKENS = 1000;
const MARKUP_MULTIPLIER = 3;
const SONNET_KRW_PER_MILLION_TOKENS = SONNET_COST_KRW_PER_MILLION_TOKENS * MARKUP_MULTIPLIER;

/** 실제 토큰 사용량 기반 청구 포인트 — 예전엔 "AI 크레딧"이라는 별도 잔액(1크레딧=20원)으로
 * 냈는데 포인트(1P=1원)로 통합됐다. promotionPoints가 정수라 소수점 과금이 안 되니, 청구가
 * 생기면(0보다 크면) 최소 1P, 그 외엔 올림해서 정수 포인트로 맞춘다. 모델/제공자마다 단가가
 * 달라서 섞여 쓰인 턴도 정확히 계산한다. */
export function pointsForUsage(usage: UsageAccumulator): number {
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
  return Math.max(1, Math.ceil(totalKrw));
}

export class InsufficientCreditsError extends Error {
  constructor() {
    super("포인트가 부족해서 AI를 쓸 수 없어요. 포인트 상점에서 충전해주세요.");
    this.name = "InsufficientCreditsError";
  }
}
