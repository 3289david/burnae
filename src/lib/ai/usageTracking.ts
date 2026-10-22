import { AsyncLocalStorage } from "node:async_hooks";
import type { AiModelKey } from "@/lib/ai/models";

interface ProviderUsage {
  promptTokens: number;
  completionTokens: number;
}

export type UsageBucketKey = AiModelKey | "fallback";

/** 모델마다(opus/sonnet/haiku) 단가가 다르고, 기본 제공자가 실패했을 때만 쓰이는
 * OpenRouter(Qwen) 폴백은 또 별개 단가라서 버킷을 나눠서 기록한다 */
export type UsageAccumulator = Record<UsageBucketKey, ProviderUsage>;

function emptyAccumulator(): UsageAccumulator {
  return {
    opus: { promptTokens: 0, completionTokens: 0 },
    sonnet: { promptTokens: 0, completionTokens: 0 },
    haiku: { promptTokens: 0, completionTokens: 0 },
    fallback: { promptTokens: 0, completionTokens: 0 },
  };
}

/**
 * AI 한 턴 안에서는 엔진의 메인 루프 호출 외에도 generate_minecraft_plugin → generatePluginContent →
 * reviewJavaSourceSafety처럼 중첩된 모델 호출이 여러 군데서 발생한다. 모든 호출 지점의 함수
 * 시그니처를 바꿔서 누적기를 일일이 전달하는 대신, 이 턴을 감싸는 동안에는 AsyncLocalStorage로 어디서
 * 호출되든 자동으로 같은 누적기에 쌓이게 한다.
 */
const storage = new AsyncLocalStorage<UsageAccumulator>();

export function recordUsage(
  usage: { prompt_tokens?: number; completion_tokens?: number } | null | undefined,
  bucket: UsageBucketKey,
): void {
  const acc = storage.getStore();
  if (!acc || !usage) return;
  acc[bucket].promptTokens += usage.prompt_tokens ?? 0;
  acc[bucket].completionTokens += usage.completion_tokens ?? 0;
}

/** fn이 중간에 실패해도 그때까지 쌓인 사용량을 잃지 않도록 에러에 실어서 다시 던진다 — 실패한
 * 턴도 그 직전까지 쓴 토큰만큼은 과금해야 한다(무한 재시도로 공짜 토큰을 쓰는 걸 막기 위함). */
export class AiTurnFailedError extends Error {
  constructor(public readonly cause: unknown, public readonly usage: UsageAccumulator) {
    super(cause instanceof Error ? cause.message : String(cause));
  }
}

export async function withUsageTracking<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; usage: UsageAccumulator }> {
  const acc = emptyAccumulator();
  try {
    const result = await storage.run(acc, fn);
    return { result, usage: acc };
  } catch (err) {
    throw new AiTurnFailedError(err, acc);
  }
}
