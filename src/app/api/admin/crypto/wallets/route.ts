import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/auth";
import { isValidXpub } from "@/lib/crypto/tronAddress";
import { isValidBtcLtcXpub } from "@/lib/crypto/btcLtcAddress";
import { isValidSolanaAddress } from "@/lib/crypto/solanaAddress";

const COINS = ["USDT_TRC20", "USDT_SOL", "BTC", "LTC", "TRX", "SOL"] as const;

/** 최고관리자만 — 지갑 설정은 돈이 들어오는 주소 자체를 바꾸는 일이라 가장 민감한 설정 */
export async function GET() {
  const admin = await requireAdminRole(["SUPER"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const configs = await prisma.cryptoWalletConfig.findMany();
  const byCoin = new Map(configs.map((c) => [c.coin, c]));
  const result = COINS.map((coin) => {
    const existing = byCoin.get(coin);
    return {
      coin,
      xpub: existing?.xpub ?? null,
      addressPool: (existing?.addressPool as { address: string; used: boolean }[] | null) ?? [],
      confirmationsRequired: existing?.confirmationsRequired ?? 1,
      enabled: existing?.enabled ?? false,
      nextDerivationIndex: existing?.nextDerivationIndex ?? 0,
    };
  });
  return NextResponse.json(result);
}

const schema = z.object({
  coin: z.enum(COINS),
  xpub: z.string().trim().min(1).optional().nullable(),
  /// 줄바꿈으로 구분한 주소 목록 텍스트 그대로 받는다(붙여넣기 쉽게) — 이미 등록된 주소는 used 상태를 그대로 유지하고 새로 추가된 것만 뒤에 붙인다
  addressPoolText: z.string().optional(),
  confirmationsRequired: z.number().int().min(1).max(50).optional(),
  enabled: z.boolean().optional(),
});

const XPUB_COINS = new Set(["USDT_TRC20", "TRX"]);
const BTC_LTC_COINS = new Set(["BTC", "LTC"]);
const POOL_COINS = new Set(["SOL", "USDT_SOL"]);

export async function PUT(request: Request) {
  const admin = await requireAdminRole(["SUPER"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." }, { status: 422 });
  }
  const { coin, xpub, addressPoolText, confirmationsRequired, enabled } = parsed.data;

  if (XPUB_COINS.has(coin) && xpub && !isValidXpub(xpub)) {
    return NextResponse.json({ error: "올바른 확장 공개키(xpub)가 아니에요. 개인키(xprv)가 아닌 공개키인지 확인해주세요." }, { status: 422 });
  }
  if (BTC_LTC_COINS.has(coin) && xpub && !isValidBtcLtcXpub(xpub)) {
    return NextResponse.json({ error: "올바른 확장 공개키(xpub)가 아니에요. 개인키(xprv)가 아닌 공개키인지 확인해주세요." }, { status: 422 });
  }

  const existing = await prisma.cryptoWalletConfig.findUnique({ where: { coin } });
  let addressPool = (existing?.addressPool as { address: string; used: boolean }[] | null) ?? [];
  if (addressPoolText !== undefined) {
    const existingAddresses = new Set(addressPool.map((p) => p.address));
    const newAddresses = addressPoolText
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !existingAddresses.has(s));
    if (POOL_COINS.has(coin)) {
      const invalid = newAddresses.find((a) => !isValidSolanaAddress(a));
      if (invalid) {
        return NextResponse.json({ error: `올바른 Solana 주소가 아니에요: ${invalid}` }, { status: 422 });
      }
    }
    addressPool = [...addressPool, ...newAddresses.map((address) => ({ address, used: false }))];
  }

  const updated = await prisma.cryptoWalletConfig.upsert({
    where: { coin },
    update: {
      ...(xpub !== undefined ? { xpub } : {}),
      ...(addressPoolText !== undefined ? { addressPool } : {}),
      ...(confirmationsRequired !== undefined ? { confirmationsRequired } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
    },
    create: {
      coin,
      xpub: xpub ?? null,
      addressPool,
      confirmationsRequired: confirmationsRequired ?? 1,
      enabled: enabled ?? false,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "CRYPTO_WALLET_CONFIG_UPDATED",
      targetType: "CryptoWalletConfig",
      targetId: coin,
      metadata: { enabled: updated.enabled, hasXpub: !!updated.xpub, addressPoolSize: addressPool.length },
    },
  });

  return NextResponse.json(updated);
}
