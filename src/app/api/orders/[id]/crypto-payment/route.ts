import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withApiErrorHandling } from "@/lib/apiHandler";
import { allocateDepositAddress, listEnabledCoins } from "@/lib/crypto/walletConfig";
import { getKrwExchangeRate } from "@/lib/crypto/exchangeRate";
import { checkTrc20Payment } from "@/lib/crypto/tronWatcher";

/** 결제 유효시간 — 이 안에 입금이 안 들어오면 만료되고, 늦게 들어온 입금은 자동 처리하지 않는다 */
const PAYMENT_WINDOW_MINUTES = 30;
/** USDT 등은 소수점 6자리까지 쓰는 게 관례 — 그보다 잘게 쪼개면 거래소/지갑이 반올림해버려서 금액이 안 맞을 수 있다 */
const CRYPTO_DECIMALS = 6;

const schema = z.object({
  coin: z.enum(["USDT_TRC20", "USDT_SOL", "BTC", "LTC", "TRX", "SOL"]),
});

/** 이 주문에 코인 결제 주소를 새로 발급한다 — 이미 발급돼 있으면 그 정보를 그대로 돌려준다(중복 발급 방지) */
export const POST = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const order = await prisma.order.findFirst({
    where: { id, userId: user.id },
    include: { cryptoPayment: true },
  });
  if (!order) return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  if (order.status !== "PENDING") {
    return NextResponse.json({ error: "이미 처리됐거나 만료된 주문이에요." }, { status: 409 });
  }
  if (order.cryptoPayment) return NextResponse.json(order.cryptoPayment);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "결제 수단을 선택해주세요." }, { status: 422 });

  const enabled = await listEnabledCoins();
  if (!enabled.includes(parsed.data.coin)) {
    return NextResponse.json({ error: "이 코인은 지금 결제를 받을 수 없어요." }, { status: 422 });
  }

  let address: string;
  let derivationIndex: number | null;
  try {
    const allocated = await allocateDepositAddress(parsed.data.coin);
    address = allocated.address;
    derivationIndex = allocated.derivationIndex;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "주소 발급에 실패했어요." }, { status: 422 });
  }

  const exchangeRate = await getKrwExchangeRate(parsed.data.coin).catch(() => {
    throw new Error("환율 조회에 실패했어요. 잠시 후 다시 시도해주세요.");
  });
  const amountCrypto = Number((order.amountKrw / exchangeRate).toFixed(CRYPTO_DECIMALS));

  const payment = await prisma.cryptoPayment.create({
    data: {
      orderId: order.id,
      coin: parsed.data.coin,
      address,
      derivationIndex,
      exchangeRateKrw: exchangeRate,
      amountCrypto,
      expiresAt: new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60 * 1000),
    },
  });

  return NextResponse.json(payment);
});

/** 체크아웃 화면이 폴링으로 부르는 상태 조회 — 부르는 김에 바로 한 번 체인을 확인해서 다음 크론을 기다리지 않게 한다 */
export const GET = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const order = await prisma.order.findFirst({ where: { id, userId: user.id }, include: { cryptoPayment: true } });
  if (!order || !order.cryptoPayment) {
    return NextResponse.json({ error: "코인 결제 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  if (order.cryptoPayment.coin === "USDT_TRC20") {
    await checkTrc20Payment(order.cryptoPayment).catch((err) => {
      console.error("[crypto-payment] 즉시 확인 실패(다음 폴링에서 재시도):", err);
    });
  }

  const fresh = await prisma.cryptoPayment.findUnique({ where: { orderId: order.id } });
  return NextResponse.json(fresh);
});
