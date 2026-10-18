import { prisma } from "@/lib/prisma";
import { markOrderPaidAndFulfill } from "@/lib/orderFulfillment";
import type { CryptoPayment } from "@/generated/prisma/client";

/** 테더(Tether)가 공식적으로 발표한 USDT의 TRON(TRC20) 컨트랙트 주소 — 이 주소가 아니면 USDT를
 * 사칭한 다른 토큰이다. 절대 바뀌지 않는 값이라 상수로 둔다. */
export const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

const TRONGRID_BASE = "https://api.trongrid.io";

interface Trc20Transfer {
  transaction_id: string;
  from: string;
  to: string;
  value: string;
  block_timestamp: number;
  token_info: { symbol: string; decimals: number; address: string };
}

interface TrackedTx {
  txHash: string;
  amount: string;
  detectedAt: string;
}

async function fetchTrc20TransfersTo(address: string): Promise<Trc20Transfer[]> {
  const url = `${TRONGRID_BASE}/v1/accounts/${address}/transactions/trc20?only_confirmed=true&only_to=true&contract_address=${USDT_TRC20_CONTRACT}&limit=50`;
  const headers: Record<string, string> = {};
  if (process.env.TRONGRID_API_KEY) headers["TRON-PRO-API-KEY"] = process.env.TRONGRID_API_KEY;
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`TronGrid 조회 실패: ${res.status}`);
  const data = (await res.json()) as { data?: Trc20Transfer[] };
  return data.data ?? [];
}

/**
 * 대기 중인 USDT(TRC20) 입금 하나를 확인한다 — TronGrid에서 이 주소로 들어온 확정된 전송을
 * 전부 가져와서, 아직 기록 안 된 트랜잭션만 누적 합산하고 상태를 갱신한다. 한 주문에 입금이
 * 여러 번 나뉘어 들어와도(부족분 추가 입금 등) 전부 합산해서 처리한다.
 */
export async function checkTrc20Payment(payment: CryptoPayment): Promise<void> {
  if (payment.coin !== "USDT_TRC20") return;
  if (!["PENDING", "DETECTED", "CONFIRMING", "UNDERPAID"].includes(payment.status)) return;

  const now = new Date();
  if (now > payment.expiresAt) {
    // 입금이 하나도 없었으면 그냥 만료. 입금이 있었는데도 만료됐으면(늦은 입금 등) 자동으로
    // 손대지 않고 관리자가 보게 한다 — "만료된 주문에 늦게 입금한 경우 별도 검토" 정책
    await prisma.cryptoPayment.update({
      where: { id: payment.id },
      data: { status: payment.receivedCrypto.greaterThan(0) ? "MANUAL_REVIEW" : "EXPIRED" },
    });
    return;
  }

  let transfers: Trc20Transfer[];
  try {
    transfers = await fetchTrc20TransfersTo(payment.address);
  } catch (err) {
    console.error(`[tronWatcher] 주소 ${payment.address} 조회 실패(다음 주기 재시도):`, err);
    return;
  }

  const existing = (payment.transactions as unknown as TrackedTx[] | null) ?? [];
  const existingHashes = new Set(existing.map((t) => t.txHash));
  const newTxs = transfers.filter((t) => !existingHashes.has(t.transaction_id));
  if (newTxs.length === 0) return;

  const decimals = newTxs[0]?.token_info?.decimals ?? 6;
  const newTotal = newTxs.reduce((sum, t) => sum + Number(t.value) / 10 ** decimals, 0);
  const updatedTxs: TrackedTx[] = [
    ...existing,
    ...newTxs.map((t) => ({ txHash: t.transaction_id, amount: String(Number(t.value) / 10 ** decimals), detectedAt: new Date().toISOString() })),
  ];
  const totalReceived = payment.receivedCrypto.toNumber() + newTotal;
  const required = payment.amountCrypto.toNumber();

  const nextStatus = totalReceived >= required ? "CONFIRMED" : "UNDERPAID";

  await prisma.cryptoPayment.update({
    where: { id: payment.id },
    data: {
      receivedCrypto: totalReceived,
      confirmations: nextStatus === "CONFIRMED" ? 1 : 0,
      transactions: updatedTxs as object,
      status: nextStatus,
    },
  });

  if (nextStatus === "CONFIRMED") {
    await markOrderPaidAndFulfill(payment.orderId).catch((err) => {
      console.error(`[tronWatcher] 주문 ${payment.orderId} 결제 확정 처리 실패:`, err);
    });
  }
}
