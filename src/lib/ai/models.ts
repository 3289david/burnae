/** 고객이 고를 수 있는 AI 모델 3종(라벨/과금 배율만 남은 레거시) — 실제 호출은 전부 OpenRouter의
 * 고정 모델로 나가므로(provider.ts), apiModel 필드는 더 이상 실제 호출에 쓰이지 않는다. */
export type AiModelKey = "opus" | "sonnet" | "haiku";

export const DEFAULT_AI_MODEL: AiModelKey = "sonnet";

interface AiModelInfo {
  label: string;
  /** 레거시 필드(과거 monken.cloud 모델명) — 더 이상 실제 호출에 쓰이지 않는다 */
  apiModel: string;
  /** 기준 단가(Sonnet) 대비 배율 */
  priceMultiplier: number;
}

export const AI_MODEL_CATALOG: Record<AiModelKey, AiModelInfo> = {
  sonnet: { label: "Claude Sonnet 5.5", apiModel: "claude-sonnet-5-5", priceMultiplier: 1 },
  opus: { label: "Claude Opus 5.5", apiModel: "claude-opus-5-5", priceMultiplier: 1.5 },
  haiku: { label: "Claude Haiku 5.5", apiModel: "claude-haiku-5-5", priceMultiplier: 0.8 },
};

export function isAiModelKey(value: string): value is AiModelKey {
  return value === "opus" || value === "sonnet" || value === "haiku";
}

export function resolveAiModelKey(value: string | null | undefined): AiModelKey {
  return value && isAiModelKey(value) ? value : DEFAULT_AI_MODEL;
}
