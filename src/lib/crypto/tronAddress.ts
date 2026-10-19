import bs58check from "bs58check";

/** TRON 메인넷 주소 접두 바이트(0x41) — Base58Check 디코딩 후 첫 바이트가 이 값이어야 한다 */
const TRON_ADDRESS_PREFIX = 0x41;

/**
 * TRON 주소 형식 확인 — "T"로 시작하고 Base58Check 디코딩 결과가 21바이트(접두 0x41 + 20바이트
 * 해시)여야 한다. 대부분의 TRON 지갑(TronLink 등)이 xpub 내보내기를 지원하지 않아서, 다른
 * 코인처럼 공개키에서 주소를 자동 파생하는 대신 운영자가 미리 받아둔 주소를 하나씩 등록해두고
 * 주문마다 꺼내 쓰는 방식(POOL_BASED, walletConfig.ts)으로 전환했다 — Solana와 같은 방식.
 */
export function isValidTronAddress(address: string): boolean {
  const trimmed = address.trim();
  if (!trimmed.startsWith("T")) return false;
  try {
    const decoded = bs58check.decode(trimmed);
    return decoded.length === 21 && decoded[0] === TRON_ADDRESS_PREFIX;
  } catch {
    return false;
  }
}
