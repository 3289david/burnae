import type { CryptoCoin } from "@/generated/prisma/enums";

/** Upbit(국내 원화마켓 거래소) 공개 시세 API — API 키 없이 바로 쓸 수 있다 */
const UPBIT_TICKER_URL = "https://api.upbit.com/v1/ticker";

/** CryptoCoin → Upbit 마켓 코드. USDT_SOL은 네트워크만 다를 뿐 USDT 자체 시세는 동일해서 USDT 마켓을 그대로 쓴다 */
const UPBIT_MARKET: Record<CryptoCoin, string | null> = {
  USDT_TRC20: "KRW-USDT",
  USDT_SOL: "KRW-USDT",
  BTC: "KRW-BTC",
  LTC: "KRW-LTC",
  TRX: "KRW-TRX",
  SOL: "KRW-SOL",
};

/** 1코인당 원화 가격을 실시간으로 가져온다. 주문 생성 시점에 한 번만 불러서 그 값을 고정해 쓴다 */
export async function getKrwExchangeRate(coin: CryptoCoin): Promise<number> {
  const market = UPBIT_MARKET[coin];
  if (!market) throw new Error(`${coin}의 환율 마켓이 설정되지 않았어요.`);

  const res = await fetch(`${UPBIT_TICKER_URL}?markets=${market}`, { cache: "no-store" });
  if (!res.ok) throw new Error("환율 조회에 실패했어요. 잠시 후 다시 시도해주세요.");
  const data = (await res.json()) as { trade_price?: number }[];
  const price = data[0]?.trade_price;
  if (!price || price <= 0) throw new Error("환율 조회 결과가 올바르지 않아요.");
  return price;
}
