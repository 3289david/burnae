import * as ecc from "tiny-secp256k1";
import { BIP32Factory } from "bip32";
import * as bitcoin from "bitcoinjs-lib";
import bs58check from "bs58check";
import type { CryptoCoin } from "@/generated/prisma/enums";

const bip32 = BIP32Factory(ecc);
bitcoin.initEccLib(ecc);

/**
 * 지갑마다 같은 계정 키를 다른 "버전 바이트"로 내보낸다(SLIP-132) — xpub(레거시), ypub(BIP49
 * 세그윗-내부-P2SH), zpub(BIP84 네이티브 세그윗) 전부 수학적으로는 같은 공개키 데이터고 앞의
 * 4바이트(버전)만 다르다. 우리는 항상 p2wpkh(네이티브 세그윗) 주소를 파생하므로, 어떤 접두사로
 * 들어오든 표준 xpub 버전 바이트로 바꿔치기한 뒤 파싱한다 — 그래야 "네이티브 세그윗 계정인데
 * 지갑이 zpub으로 보여줘서" 안 된다고 거절하는 일이 없다.
 */
const XPUB_VERSION_BYTES = Buffer.from([0x04, 0x88, 0xb2, 0x1e]);
const ALT_VERSION_PREFIXES = new Set(["ypub", "zpub", "Ltub", "Mtub", "upub", "vpub"]);

function normalizeToXpub(input: string): string {
  const trimmed = input.trim();
  const prefix = trimmed.slice(0, 4);
  if (prefix === "xpub" || !ALT_VERSION_PREFIXES.has(prefix)) return trimmed;
  const decoded = bs58check.decode(trimmed);
  const payload = Buffer.from(decoded).subarray(4);
  return bs58check.encode(Buffer.concat([XPUB_VERSION_BYTES, payload]));
}

/**
 * Litecoin 메인넷 주소 파라미터 — bitcoinjs-lib에 기본 내장된 네트워크가 아니라서 직접 정의한다.
 * (출처: Litecoin Core 소스의 chainparams.cpp에 박힌 값들, 거의 모든 LTC 지갑/탐색기가 이 값을 씀)
 */
const LITECOIN_NETWORK: bitcoin.networks.Network = {
  messagePrefix: "\x19Litecoin Signed Message:\n",
  bech32: "ltc",
  bip32: { public: 0x0488b21e, private: 0x0488ade4 }, // 표준 BTC xpub 버전 바이트를 그대로 재사용(실무 관례)
  pubKeyHash: 0x30,
  scriptHash: 0x32,
  wif: 0xb0,
};

const NETWORK: Record<"BTC" | "LTC", bitcoin.networks.Network> = {
  BTC: bitcoin.networks.bitcoin,
  LTC: LITECOIN_NETWORK,
};

/**
 * xpub(BIP32 확장 "공개"키)에서 네이티브 세그윗(bech32, bc1.../ltc1...) 주소를 파생한다 —
 * 개인키는 전혀 필요 없다. 경로는 m/0/{index}(BIP44 "external" 체인) — xpub을 내보낼 때 이미
 * 계정 단계(m/84'/0'/0' 등)까지 경화 파생을 끝낸 상태라고 가정한다.
 *
 * Litecoin 지갑은 흔히 Bitcoin과 같은 xpub 버전 바이트를 그대로 쓰기 때문에(Ltub/Mtub로 표시하는
 * 지갑도 있지만 표준 xpub을 그대로 쓰는 경우가 더 흔함), 여기서는 표준 xpub 입력을 받는다.
 */
export function deriveBtcLtcAddress(xpub: string, index: number, coin: "BTC" | "LTC"): string {
  const network = NETWORK[coin];
  const normalized = normalizeToXpub(xpub);
  const accountNode = bip32.fromBase58(normalized, coin === "BTC" ? undefined : network);
  const child = accountNode.derive(0).derive(index);
  const { address } = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(child.publicKey), network });
  if (!address) throw new Error("주소 파생에 실패했어요.");
  return address;
}

export function isValidBtcLtcXpub(xpub: string): boolean {
  try {
    const node = bip32.fromBase58(normalizeToXpub(xpub));
    return !node.privateKey;
  } catch {
    return false;
  }
}

export function networkForCoin(coin: CryptoCoin): "BTC" | "LTC" | null {
  if (coin === "BTC") return "BTC";
  if (coin === "LTC") return "LTC";
  return null;
}
