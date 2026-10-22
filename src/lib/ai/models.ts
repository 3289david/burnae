/** 고객이 고를 수 있는 AI 모델 3종. Sonnet을 가격 기준점으로 두고(기존에 쓰던 단가 그대로),
 * Opus는 1.5배, Haiku는 0.8배로 차등 과금한다 — 전부 monken.cloud(기본 제공자)를 통해 호출된다.
 * OpenRouter(Qwen) 폴백은 모델 선택과 무관하게 항상 같은 모델/단가로 동작한다(pricing.ts 참고). */
export type AiModelKey = "opus" | "sonnet" | "haiku";

export const DEFAULT_AI_MODEL: AiModelKey = "sonnet";

interface AiModelInfo {
  label: string;
  /** monken.cloud에 실제로 보낼 모델 이름 */
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
