import { NextResponse } from "next/server";
import { listEnabledCoins } from "@/lib/crypto/walletConfig";
import { getKrwExchangeRate } from "@/lib/crypto/exchangeRate";

const COIN_LABEL: Record<string, string> = {
  USDT_TRC20: "USDT · TRON 네트워크",
  USDT_SOL: "USDT · Solana 네트워크",
  BTC: "Bitcoin (BTC)",
  LTC: "Litecoin (LTC)",
  TRX: "TRON (TRX)",
  SOL: "Solana (SOL)",
};

/** 체크아웃 화면의 "코인 선택" 목록 — 지금 실제로 결제받을 수 있는 코인과 대략적인 환산 금액(아직 확정 아님) */
export async function GET(request: Request) {
  const amountKrw = Number(new URL(request.url).searchParams.get("amountKrw") ?? "0");

  const coins = await listEnabledCoins();
  const result = await Promise.all(
    coins.map(async (coin) => {
      try {
        const rate = await getKrwExchangeRate(coin);
        return {
          coin,
          label: COIN_LABEL[coin] ?? coin,
          rateKrw: rate,
          estimatedAmount: amountKrw > 0 ? Number((amountKrw / rate).toFixed(6)) : null,
        };
      } catch {
        return null;
      }
    }),
  );

  return NextResponse.json(result.filter((r) => r !== null));
}
