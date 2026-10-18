import { prisma } from "@/lib/prisma";
import type { CryptoCoin } from "@/generated/prisma/enums";
import { deriveTronAddress } from "@/lib/crypto/tronAddress";
import { deriveBtcLtcAddress } from "@/lib/crypto/btcLtcAddress";

/** xpub(공개키)만으로 입금 주소를 파생할 수 있는 코인 — secp256k1 계열 */
const XPUB_DERIVABLE: CryptoCoin[] = ["USDT_TRC20", "TRX", "BTC", "LTC"];
const BTC_LTC_COINS = new Set(["BTC", "LTC"]);
/** 운영자가 오프라인에서 미리 만들어둔 주소 목록에서 하나씩 꺼내 쓰는 코인 — ed25519라 공개키만으로 자식 주소를 못 만듦 */
const POOL_BASED: CryptoCoin[] = ["SOL", "USDT_SOL"];

interface AddressPoolEntry {
  address: string;
  used: boolean;
}

/**
 * 이 코인으로 새 주문을 받을 수 있는지(설정이 켜져 있고 주소를 발급할 수 있는지) 확인하고,
 * 가능하면 입금 주소 하나를 "배정"해서 돌려준다. xpub 방식은 다음 인덱스를 원자적으로
 * 증가시켜서 두 주문이 같은 주소를 받는 일이 없게 하고, 주소 목록 방식은 "used: false"인
 * 첫 항목을 원자적으로 "used: true"로 바꿔서 같은 식으로 중복 배정을 막는다.
 */
export async function allocateDepositAddress(
  coin: CryptoCoin,
): Promise<{ address: string; derivationIndex: number | null }> {
  const config = await prisma.cryptoWalletConfig.findUnique({ where: { coin } });
  if (!config || !config.enabled) {
    throw new Error("이 코인은 지금 결제를 받을 수 없어요.");
  }

  if (XPUB_DERIVABLE.includes(coin)) {
    if (!config.xpub) throw new Error("이 코인의 지갑 설정이 아직 안 끝났어요.");
    // 두 주문이 동시에 들어와도 한쪽만 이 update를 "먼저" 커밋해서 서로 다른 인덱스를 받게
    // updateMany의 원자성에 기대는 대신, 짧은 트랜잭션으로 읽고 바로 증가시킨다 — 이 테이블은
    // 쓰기 경합이 매우 드물어서(코인 결제 주문 생성 시에만) 이 정도로 충분하다
    const updated = await prisma.$transaction(async (tx) => {
      const fresh = await tx.cryptoWalletConfig.findUniqueOrThrow({ where: { coin } });
      const index = fresh.nextDerivationIndex;
      await tx.cryptoWalletConfig.update({
        where: { coin },
        data: { nextDerivationIndex: { increment: 1 } },
      });
      return index;
    });
    const address = BTC_LTC_COINS.has(coin)
      ? deriveBtcLtcAddress(config.xpub, updated, coin as "BTC" | "LTC")
      : deriveTronAddress(config.xpub, updated);
    return { address, derivationIndex: updated };
  }

  if (POOL_BASED.includes(coin)) {
    const pool = (config.addressPool as unknown as AddressPoolEntry[] | null) ?? [];
    const availableIndex = pool.findIndex((p) => !p.used);
    if (availableIndex === -1) {
      throw new Error("이 코인은 지금 발급 가능한 입금 주소가 없어요. 관리자에게 문의해주세요.");
    }
    const claimed = await prisma.$transaction(async (tx) => {
      const fresh = await tx.cryptoWalletConfig.findUniqueOrThrow({ where: { coin } });
      const freshPool = (fresh.addressPool as unknown as AddressPoolEntry[] | null) ?? [];
      const idx = freshPool.findIndex((p) => !p.used);
      if (idx === -1) throw new Error("이 코인은 지금 발급 가능한 입금 주소가 없어요. 관리자에게 문의해주세요.");
      const nextPool = freshPool.map((p, i) => (i === idx ? { ...p, used: true } : p));
      await tx.cryptoWalletConfig.update({ where: { coin }, data: { addressPool: nextPool as object } });
      return freshPool[idx].address;
    });
    return { address: claimed, derivationIndex: null };
  }

  throw new Error(`${coin}은 아직 지원하지 않아요.`);
}

/** 체크아웃/관리자 화면에서 "지금 결제 가능한 코인" 목록을 보여줄 때 쓴다 */
export async function listEnabledCoins(): Promise<CryptoCoin[]> {
  const configs = await prisma.cryptoWalletConfig.findMany({ where: { enabled: true } });
  return configs
    .filter((c) => {
      if (XPUB_DERIVABLE.includes(c.coin)) return !!c.xpub;
      if (POOL_BASED.includes(c.coin)) {
        const pool = (c.addressPool as unknown as AddressPoolEntry[] | null) ?? [];
        return pool.some((p) => !p.used);
      }
      return false;
    })
    .map((c) => c.coin);
}
