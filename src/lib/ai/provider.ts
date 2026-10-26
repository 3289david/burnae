import OpenAI from "openai";
import { recordUsage } from "@/lib/ai/usageTracking";
import { AI_MODEL_CATALOG, DEFAULT_AI_MODEL, type AiModelKey } from "@/lib/ai/models";

/**
 * AI 호출의 기본 제공자는 monken.cloud(OpenAI 호환, Claude 계열 모델을 그대로 씀)이고,
 * 호출이 실패하면(네트워크 오류, 5xx, 인증 문제 등) OpenRouter(Qwen)로 자동 전환한다.
 * 어느 쪽/어느 모델을 실제로 썼는지에 따라 과금 단가가 다르므로(pricing.ts), 사용량도 여기서
 * 모델 키와 함께 기록한다 — 호출부는 신경 쓸 필요 없이 이 함수 하나만 쓰면 된다.
 *
 * 클라이언트는 첫 호출 시점에 생성한다 — OpenAI SDK는 apiKey가 없으면 생성자에서 바로
 * 예외를 던지는데, 빌드 시점(next build의 route 정적 분석)에는 아직 .env가 없을 수 있어서
 * 모듈 로드 시점에 즉시 생성하면 빌드가 깨진다.
 */
let _primaryClient: OpenAI | null = null;
function getPrimaryClient(): OpenAI | null {
  const apiKey = process.env.AI_PRIMARY_API_KEY;
  const baseURL = process.env.AI_PRIMARY_BASE_URL;
  if (!apiKey || !baseURL) return null;
  if (!_primaryClient) {
    _primaryClient = new OpenAI({ apiKey, baseURL });
  }
  return _primaryClient;
}

let _fallbackClient: OpenAI | null = null;
function getFallbackClient(): OpenAI {
  if (!_fallbackClient) {
    _fallbackClient = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY || "unset",
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://burnae.kr",
        "X-Title": "Burnae AI",
      },
    });
  }
  return _fallbackClient;
}
export const FALLBACK_MODEL = process.env.OPENROUTER_MODEL ?? "qwen/qwen3-235b-a22b-2507";

type ChatParams = Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, "model">;

export async function createChatCompletion(
  params: ChatParams,
  modelKey: AiModelKey = DEFAULT_AI_MODEL,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const primary = getPrimaryClient();
  if (primary) {
    try {
      const res = await primary.chat.completions.create({ ...params, model: AI_MODEL_CATALOG[modelKey].apiModel });
      recordUsage(res.usage, modelKey);
      return res;
    } catch (err) {
      console.error("[ai] 기본 AI 제공자(monken.cloud) 호출 실패, OpenRouter로 폴백:", err);
    }
  }
  const res = await getFallbackClient().chat.completions.create({ ...params, model: FALLBACK_MODEL });
  recordUsage(res.usage, "fallback");
  return res;
}

export { createApmixChatCompletion, APMIX_MODEL, APMIX_BASE_URL } from "@/lib/ai/apmix";
