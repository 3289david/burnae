import OpenAI from "openai";
import { recordUsage } from "@/lib/ai/usageTracking";
import type { AiModelKey } from "@/lib/ai/models";

/**
 * AI 호출은 전부 OpenRouter를 통해서만 한다 — monken.cloud는 더 이상 쓰지 않는다. opus/sonnet/haiku
 * 구분은 과거 monken.cloud 모델 선택용이었고, OpenRouter로만 호출하던 기존 폴백 경로는 애초에
 * 모델 선택과 무관하게 항상 같은 모델/단가("fallback" 버킷)로 동작했다 — 이제 모든 호출이 그
 * 경로를 쓰므로 모델 키는 호출부 호환을 위해 받긴 하지만 실제 모델 선택에는 쓰지 않는다.
 *
 * 클라이언트는 첫 호출 시점에 생성한다 — OpenAI SDK는 apiKey가 없으면 생성자에서 바로
 * 예외를 던지는데, 빌드 시점(next build의 route 정적 분석)에는 아직 .env가 없을 수 있어서
 * 모듈 로드 시점에 즉시 생성하면 빌드가 깨진다.
 */
let _openRouterClient: OpenAI | null = null;
function getOpenRouterClient(): OpenAI {
  if (!_openRouterClient) {
    _openRouterClient = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY || "unset",
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://burnae.kr",
        "X-Title": "Burnae AI",
      },
    });
  }
  return _openRouterClient;
}
export const FALLBACK_MODEL = process.env.OPENROUTER_MODEL ?? "qwen/qwen3-235b-a22b-2507";

type ChatParams = Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, "model">;

export async function createChatCompletion(
  params: ChatParams,
  _modelKey?: AiModelKey,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const res = await getOpenRouterClient().chat.completions.create({ ...params, model: FALLBACK_MODEL });
  recordUsage(res.usage, "fallback");
  return res;
}
