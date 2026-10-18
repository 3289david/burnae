import { prisma } from "@/lib/prisma";
import { markOrderPaidAndFulfill } from "@/lib/orderFulfillment";
import type { CryptoPayment } from "@/generated/prisma/client";

/**
 * BlockCypher — BTC/LTC 둘 다 같은 URL 패턴으로 지원하는 공개 블록 탐색기 API. 토큰 없이도
 * 쓸 수 있지만 시간당 요청 수가 적어서(200/h), 결제가 몰리는 서비스라면 무료 가입으로 받는
 * BLOCKCYPHER_API_TOKEN을 꼭 설정하는 걸 권장한다(2,000/h로 늘어남).
 */
const BLOCKCYPHER_COIN: Record<"BTC" | "LTC", string> = { BTC: "btc", LTC: "ltc" };

interface BlockCypherTx {
  hash: string;
  confirmations: number;
  outputs: { value: number; addresses?: string[] }[];
}

interface TrackedTx {
  txHash: string;
  amount: string;
  confirmations: number;
  detectedAt: string;
}

async function fetchAddressTxs(coin: "BTC" | "LTC", address: string): Promise<BlockCypherTx[]> {
  const token = process.env.BLOCKCYPHER_API_TOKEN;
  const url = `https://api.blockcypher.com/v1/${BLOCKCYPHER_COIN[coin]}/main/addrs/${address}/full${token ? `?token=${token}` : ""}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`BlockCypher 조회 실패: ${res.status}`);
  const data = (await res.json()) as { txs?: BlockCypherTx[] };
  return data.txs ?? [];
}

/** BTC/LTC 입금 하나를 확인한다 — 이 주소로 들어온 출력(output)만 합산하고, 지정된 확인 수를
 * 채운 트랜잭션만 "확정된 금액"으로 센다(USDT-TRC20과 달리 BTC/LTC는 블록 재구성이 흔해서
 * confirmations 필드를 직접 비교한다). */
export async function checkBtcLtcPayment(payment: CryptoPayment): Promise<void> {
  if (payment.coin !== "BTC" && payment.coin !== "LTC") return;
  if (!["PENDING", "DETECTED", "CONFIRMING", "UNDERPAID"].includes(payment.status)) return;

  const now = new Date();
  if (now > payment.expiresAt) {
    await prisma.cryptoPayment.update({
      where: { id: payment.id },
      data: { status: payment.receivedCrypto.greaterThan(0) ? "MANUAL_REVIEW" : "EXPIRED" },
    });
    return;
  }

  const config = await prisma.cryptoWalletConfig.findUnique({ where: { coin: payment.coin } });
  const requiredConfirmations = config?.confirmationsRequired ?? 1;

  let txs: BlockCypherTx[];
  try {
    txs = await fetchAddressTxs(payment.coin, payment.address);
  } catch (err) {
    console.error(`[btcLtcWatcher] 주소 ${payment.address} 조회 실패(다음 주기 재시도):`, err);
    return;
  }

  const existing = (payment.transactions as unknown as TrackedTx[] | null) ?? [];
  const existingByHash = new Map(existing.map((t) => [t.txHash, t]));

  let changed = false;
  const updatedTxs: TrackedTx[] = [];
  for (const tx of txs) {
    const amountSats = tx.outputs
      .filter((o) => o.addresses?.includes(payment.address))
      .reduce((sum, o) => sum + o.value, 0);
    if (amountSats === 0) continue;

    const prevEntry = existingByHash.get(tx.hash);
    if (!prevEntry || prevEntry.confirmations !== tx.confirmations) changed = true;
    updatedTxs.push({
      txHash: tx.hash,
      amount: String(amountSats / 1e8),
      confirmations: tx.confirmations,
      detectedAt: prevEntry?.detectedAt ?? new Date().toISOString(),
    });
  }
  // BlockCypher가 더 이상 안 보여주는(리오그로 사라진) 트랜잭션은 자연히 목록에서 빠진다
  if (updatedTxs.length !== existing.length) changed = true;
  if (!changed) return;

  const confirmedTotal = updatedTxs
    .filter((t) => t.confirmations >= requiredConfirmations)
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const required = payment.amountCrypto.toNumber();
  const anyReceived = updatedTxs.length > 0;

  let nextStatus: "PENDING" | "DETECTED" | "UNDERPAID" | "CONFIRMED";
  if (!anyReceived) nextStatus = "PENDING";
  else if (confirmedTotal >= required) nextStatus = "CONFIRMED";
  else if (updatedTxs.some((t) => t.confirmations < requiredConfirmations)) nextStatus = "DETECTED";
  else nextStatus = "UNDERPAID";

  await prisma.cryptoPayment.update({
    where: { id: payment.id },
    data: {
      receivedCrypto: confirmedTotal,
      confirmations: Math.max(0, ...updatedTxs.map((t) => t.confirmations)),
      transactions: updatedTxs as unknown as object,
      status: nextStatus,
    },
  });

  if (nextStatus === "CONFIRMED") {
    await markOrderPaidAndFulfill(payment.orderId).catch((err) => {
      console.error(`[btcLtcWatcher] 주문 ${payment.orderId} 결제 확정 처리 실패:`, err);
    });
  }
}
