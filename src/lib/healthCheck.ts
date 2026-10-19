/**
 * Render/Railway 스타일 헬스체크 — HTTP로 서비스하는 서버(GENERAL/DISCORD_BOT)에만 의미가
 * 있다. 마인크래프트는 raw TCP라 HTTP 핑 자체가 불가능해서 대상이 아니다.
 */
const TIMEOUT_MS = 5000;

export async function pingHealthCheck(ip: string, port: number, path: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`http://${ip}:${port}${path.startsWith("/") ? path : `/${path}`}`, {
      signal: controller.signal,
      redirect: "follow",
    });
    // 2xx/3xx면 살아있다고 본다 — 404조차 "서버 프로세스가 응답하긴 한다"는 신호로 충분한
    // 경우가 많지만, 5xx나 연결 자체가 안 되는 건 다르게 취급한다
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
