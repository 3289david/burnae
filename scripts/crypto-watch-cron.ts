import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { checkTrc20Payment } from "../src/lib/crypto/tronWatcher";
import { checkBtcLtcPayment } from "../src/lib/crypto/btcLtcWatcher";
import { checkSolanaPayment } from "../src/lib/crypto/solanaWatcher";
import type { CryptoPayment } from "../src/generated/prisma/client";

/**
 * 블록체인 입금은 일반 운영 크론(10분 간격)보다 훨씬 빠르게 확인해야 체크아웃 화면에서
 * 기다리는 고객 경험이 괜찮다 — 그래서 별도 타이머(burnae-crypto-watch.timer, 1분 간격)로 돌린다.
 */
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// TronGrid 무료(API 키 없음) 등급은 초당 1건으로 매우 빡빡하다 — API 키를 넣으면(TRONGRID_API_KEY)
// 훨씬 널널해지니 결제가 여러 건 동시에 몰리는 서비스라면 꼭 발급받는 걸 권장한다. 키가 없을 때는
// 결제 사이에 살짝 간격을 둬서 같은 틱 안에서 바로 막히는 것만이라도 피한다.
const STAGGER_MS = process.env.TRONGRID_API_KEY ? 0 : 1100;

const CHECKERS: Record<string, (p: CryptoPayment) => Promise<void>> = {
  USDT_TRC20: checkTrc20Payment,
  TRX: checkTrc20Payment,
  BTC: checkBtcLtcPayment,
  LTC: checkBtcLtcPayment,
  SOL: checkSolanaPayment,
  USDT_SOL: checkSolanaPayment,
};

async function main() {
  const pending = await prisma.cryptoPayment.findMany({
    where: { status: { in: ["PENDING", "DETECTED", "CONFIRMING", "UNDERPAID"] } },
  });
  for (const payment of pending) {
    const checker = CHECKERS[payment.coin];
    if (!checker) continue;
    try {
      await checker(payment);
    } catch (err) {
      console.error(`[crypto-watch] 결제 ${payment.id} 확인 실패:`, err);
    }
    if (STAGGER_MS > 0 && (payment.coin === "USDT_TRC20" || payment.coin === "TRX")) {
      await new Promise((r) => setTimeout(r, STAGGER_MS));
    }
  }
  if (pending.length > 0) console.log(`[crypto-watch] ${pending.length}건 확인함`);
}

main()
  .catch((err) => {
    console.error("[crypto-watch] 실행 실패:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
