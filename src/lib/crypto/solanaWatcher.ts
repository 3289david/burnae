import { prisma } from "@/lib/prisma";
import { markOrderPaidAndFulfill } from "@/lib/orderFulfillment";
import type { CryptoPayment } from "@/generated/prisma/client";

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const USDT_SPL_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

interface RpcResponse<T> {
  result?: T;
  error?: { message: string };
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Solana RPC 실패: ${res.status}`);
  const data = (await res.json()) as RpcResponse<T>;
  if (data.error) throw new Error(`Solana RPC 오류: ${data.error.message}`);
  return data.result as T;
}

async function getNativeSolBalance(address: string): Promise<number> {
  const result = await rpc<{ value: number }>("getBalance", [address, { commitment: "finalized" }]);
  return result.value / 1e9;
}

interface TokenAccountsResult {
  value: { account: { data: { parsed: { info: { tokenAmount: { uiAmount: number | null } } } } } }[];
}

async function getUsdtSplBalance(ownerAddress: string): Promise<number> {
  const result = await rpc<TokenAccountsResult>("getTokenAccountsByOwner", [
    ownerAddress,
    { mint: USDT_SPL_MINT },
    { encoding: "jsonParsed", commitment: "finalized" },
  ]);
  return result.value.reduce((sum, acc) => sum + (acc.account.data.parsed.info.tokenAmount.uiAmount ?? 0), 0);
}

/**
 * Solana는 BTC/LTC처럼 확인 수가 블록마다 쌓이는 구조가 아니라 processed/confirmed/finalized
 * 커밋먼트 단계로 끊어서 본다. 받기 전용 주소는 주문 하나당 addressPool에서 하나씩만 배정되고
 * 재사용되지 않으므로, 트랜잭션을 하나하나 추적할 필요 없이 "지금 그 주소(또는 그 주소의 USDT
 * 토큰 계정)의 finalized 잔액"을 그대로 누적 입금액으로 취급해도 안전하다.
 */
export async function checkSolanaPayment(payment: CryptoPayment): Promise<void> {
  if (payment.coin !== "SOL" && payment.coin !== "USDT_SOL") return;
  if (!["PENDING", "DETECTED", "CONFIRMING", "UNDERPAID"].includes(payment.status)) return;

  const now = new Date();
  if (now > payment.expiresAt) {
    await prisma.cryptoPayment.update({
      where: { id: payment.id },
      data: { status: payment.receivedCrypto.greaterThan(0) ? "MANUAL_REVIEW" : "EXPIRED" },
    });
    return;
  }

  let balance: number;
  try {
    balance =
      payment.coin === "SOL" ? await getNativeSolBalance(payment.address) : await getUsdtSplBalance(payment.address);
  } catch (err) {
    console.error(`[solanaWatcher] 주소 ${payment.address} 조회 실패(다음 주기 재시도):`, err);
    return;
  }

  if (balance === payment.receivedCrypto.toNumber()) return;

  const required = payment.amountCrypto.toNumber();
  const nextStatus: "PENDING" | "UNDERPAID" | "CONFIRMED" = balance === 0 ? "PENDING" : balance >= required ? "CONFIRMED" : "UNDERPAID";

  await prisma.cryptoPayment.update({
    where: { id: payment.id },
    data: { receivedCrypto: balance, confirmations: balance > 0 ? 1 : 0, status: nextStatus },
  });

  if (nextStatus === "CONFIRMED") {
    await markOrderPaidAndFulfill(payment.orderId).catch((err) => {
      console.error(`[solanaWatcher] 주문 ${payment.orderId} 결제 확정 처리 실패:`, err);
    });
  }
}
