import { NextResponse } from "next/server";

/**
 * 메모리 기반 고정 윈도우 레이트리밋 — Redis 없이 로그인/가입/AI 채팅 같은 민감한 라우트를
 * 기본적인 폭주(브루트포스, 스팸 가입, 비용 유발 AI 호출 남용)로부터 지킨다.
 * burnae-web/burnae-web-2 두 프로세스가 번갈아 요청을 받아서 한도가 실제로는 프로세스당
 * 절반씩 나뉘지만(공유 저장소가 아니라서), 기본적인 어뷰징을 막는 용도로는 충분하다.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

let lastSweep = Date.now();
function sweepExpired(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  sweepExpired(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count++;
  return { allowed: true, retryAfterSec: 0 };
}

export function rateLimitResponse(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error: "요청이 너무 잦아요. 잠시 후 다시 시도해주세요." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}
