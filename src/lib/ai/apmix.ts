import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { recordUsage } from "@/lib/ai/usageTracking";

export interface ApmixKeyRecord {
  id: string;
  key: string;
  label: string | null;
  active: boolean;
  fail_count: number;
  last_error: string | null;
  last_used_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export const APMIX_BASE_URL = "https://api.apmix.ai/v1";
export const APMIX_MODEL = "claude-sonnet-4-6-free";

let tableEnsured = false;

/**
 * apmix_api_keys 테이블이 없으면 자동 생성한다.
 * 마이그레이션을 수동으로 실행하지 않아도 런타임에서 자가 복구된다.
 */
export async function ensureApmixTable(): Promise<void> {
  if (tableEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS apmix_api_keys (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        label TEXT,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        fail_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        last_used_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);
    tableEnsured = true;
  } catch (err) {
    console.error("[apmix] ensureApmixTable failed:", err);
  }
}

/**
 * 모든 apmix.ai API 키를 조회한다.
 * 활성 상태가 우선이며, 실패 횟수가 적은 키가 앞에 온다.
 */
export async function getApmixKeys(): Promise<ApmixKeyRecord[]> {
  await ensureApmixTable();
  try {
    const rows = await prisma.$queryRawUnsafe<ApmixKeyRecord[]>(`
      SELECT id, key, label, active, fail_count, last_error, last_used_at, created_at, updated_at
      FROM apmix_api_keys
      ORDER BY active DESC, fail_count ASC, created_at ASC;
    `);
    return rows;
  } catch (err) {
    console.error("[apmix] getApmixKeys query failed:", err);
    return [];
  }
}

/**
 * 하나 이상의 apmix API 키를 데이터베이스에 추가한다.
 */
export async function addApmixKeys(
  items: { key: string; label?: string }[],
): Promise<number> {
  await ensureApmixTable();
  let count = 0;
  for (const item of items) {
    const trimmed = item.key.trim();
    if (!trimmed) continue;
    const id =
      "ak_" +
      Math.random().toString(36).substring(2, 9) +
      "_" +
      Date.now().toString(36);
    const label = item.label?.trim() || null;
    await prisma.$executeRawUnsafe(
      `INSERT INTO apmix_api_keys (id, key, label, active, fail_count, created_at, updated_at)
       VALUES ($1, $2, $3, TRUE, 0, NOW(), NOW())`,
      id,
      trimmed,
      label,
    );
    count++;
  }
  return count;
}

/**
 * 특정 키의 상태(활성화 여부, 라벨, 오류 초기화 등)를 수정한다.
 */
export async function updateApmixKey(
  id: string,
  data: { active?: boolean; label?: string; resetFail?: boolean },
): Promise<void> {
  await ensureApmixTable();
  if (data.resetFail) {
    await prisma.$executeRawUnsafe(
      `UPDATE apmix_api_keys SET fail_count = 0, last_error = NULL, updated_at = NOW() WHERE id = $1`,
      id,
    );
  }
  if (data.active !== undefined) {
    await prisma.$executeRawUnsafe(
      `UPDATE apmix_api_keys SET active = $1, updated_at = NOW() WHERE id = $2`,
      data.active,
      id,
    );
  }
  if (data.label !== undefined) {
    await prisma.$executeRawUnsafe(
      `UPDATE apmix_api_keys SET label = $1, updated_at = NOW() WHERE id = $2`,
      data.label,
      id,
    );
  }
}

/**
 * 특정 apmix API 키를 삭제한다.
 */
export async function deleteApmixKey(id: string): Promise<void> {
  await ensureApmixTable();
  await prisma.$executeRawUnsafe(`DELETE FROM apmix_api_keys WHERE id = $1`, id);
}

/**
 * 키 호출 성공 시 상태 업데이트 (마지막 사용 시각 갱신, 오류 카운트 리셋)
 */
export async function recordApmixSuccess(id: string): Promise<void> {
  if (id.startsWith("env_")) return;
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE apmix_api_keys SET last_used_at = NOW(), fail_count = 0, last_error = NULL, updated_at = NOW() WHERE id = $1`,
      id,
    );
  } catch (err) {
    console.error("[apmix] recordApmixSuccess error:", err);
  }
}

/**
 * 키 호출 실패 시 상태 업데이트 (실패 횟수 증가, 마지막 오류 내용 기록)
 */
export async function recordApmixFailure(
  id: string,
  errorMessage: string,
): Promise<void> {
  if (id.startsWith("env_")) return;
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE apmix_api_keys SET fail_count = fail_count + 1, last_error = $1, updated_at = NOW() WHERE id = $2`,
      errorMessage.slice(0, 500),
      id,
    );
  } catch (err) {
    console.error("[apmix] recordApmixFailure error:", err);
  }
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 10) return "******";
  return key.slice(0, 6) + "..." + key.slice(-4);
}

type ChatParams = Omit<
  OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  "model"
>;

/**
 * apmix.ai API를 호출한다 (모델: claude-sonnet-4-6-free).
 * 등록된 API 키 중 활성화된 키들을 순서대로 시도하며,
 * 특정 키가 실패(인증 오류, 할당량 초과, 5xx, 네트워크 오류 등)하면
 * 즉시 다음 키로 전환(Failover)한다.
 */
export async function createApmixChatCompletion(
  params: ChatParams,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const allKeys = await getApmixKeys();
  let candidateKeys = allKeys.filter((k) => k.active);

  // DB에 활성 키가 없을 경우 환경변수(APMIX_API_KEY 또는 APMIX_API_KEYS) 확인
  if (candidateKeys.length === 0) {
    const envVal = process.env.APMIX_API_KEY || process.env.APMIX_API_KEYS;
    if (envVal) {
      const parsed = envVal
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      candidateKeys = parsed.map((k, idx) => ({
        id: `env_${idx}`,
        key: k,
        label: `환경변수 키 #${idx + 1}`,
        active: true,
        fail_count: 0,
        last_error: null,
        last_used_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      }));
    }
  }

  if (candidateKeys.length === 0) {
    throw new Error(
      "등록된 apmix.ai API 키가 없습니다. 관리자 패널(AI 설정)에서 API 키를 추가해주세요.",
    );
  }

  // 실패 횟수가 적은 키를 우선적으로 시도
  candidateKeys.sort((a, b) => a.fail_count - b.fail_count);

  const errors: { keyDesc: string; error: string }[] = [];

  for (let i = 0; i < candidateKeys.length; i++) {
    const current = candidateKeys[i];
    const keyDesc = current.label
      ? `${current.label} (${maskKey(current.key)})`
      : maskKey(current.key);

    try {
      const client = new OpenAI({
        apiKey: current.key,
        baseURL: APMIX_BASE_URL,
        timeout: 60000,
      });

      const res = await client.chat.completions.create({
        ...params,
        model: APMIX_MODEL,
      });

      await recordApmixSuccess(current.id);
      recordUsage(res.usage, "sonnet");
      return res;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[apmix] API 키 ${keyDesc} 호출 실패: ${errMsg}. 다음 키로 전환을 시도합니다.`,
      );
      await recordApmixFailure(current.id, errMsg);
      errors.push({ keyDesc, error: errMsg });
    }
  }

  const lastErrMsg = errors[errors.length - 1]?.error || "알 수 없는 오류";
  throw new Error(
    `모든 apmix.ai API 키 (${candidateKeys.length}개) 호출에 실패했습니다. 마지막 오류: ${lastErrMsg}`,
  );
}

/**
 * 특정 API 키를 단독으로 테스트 호출(ping)하여 유효성을 확인한다.
 */
export async function testApmixKey(
  key: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = new OpenAI({
      apiKey: key.trim(),
      baseURL: APMIX_BASE_URL,
      timeout: 15000,
    });
    await client.chat.completions.create({
      model: APMIX_MODEL,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 5,
    });
    return { ok: true };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: errMsg };
  }
}
