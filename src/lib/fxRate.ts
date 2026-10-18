/**
 * 영어(/en) 페이지에서 원화 가격을 참고용 달러 환산으로 같이 보여주기 위한 환율.
 * 실제 결제/청구는 항상 원화 기준이고(계좌이체가 핵심 결제 수단), 이건 어디까지나
 * "대략 이 정도예요"를 보여주는 표시용이라 1시간 캐시로 충분하다.
 */
let cached: { rate: number; at: number } | null = null;
const CACHE_MS = 60 * 60 * 1000;

export async function getUsdPerKrw(): Promise<number> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.rate;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
    if (!res.ok) throw new Error(`환율 조회 실패: ${res.status}`);
    const data = (await res.json()) as { rates?: Record<string, number> };
    const krw = data.rates?.KRW;
    if (!krw || krw <= 0) throw new Error("환율 응답이 올바르지 않아요.");
    const rate = 1 / krw;
    cached = { rate, at: Date.now() };
    return rate;
  } catch (err) {
    if (cached) return cached.rate; // 실패해도 직전 캐시가 있으면 그거라도 쓴다
    console.error("[fxRate] USD/KRW 환율 조회 실패, 대략값으로 폴백:", err);
    return 1 / 1350; // 최후 폴백(대략값) — 조회가 계속 실패해도 화면이 깨지진 않게
  }
}

export function formatUsdApprox(amountKrw: number, usdPerKrw: number): string {
  const usd = amountKrw * usdPerKrw;
  return `≈ $${usd.toLocaleString("en-US", { minimumFractionDigits: usd < 10 ? 2 : 0, maximumFractionDigits: 2 })}`;
}
