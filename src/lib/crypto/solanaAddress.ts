/**
 * ed25519(Solana이 쓰는 곡선)은 secp256k1과 달리 "공개"키만으로 자식 주소를 파생할 수 없다
 * (BIP32 비경화 파생이 ed25519에서는 수학적으로 불가능 — SLIP-0010 명세 자체가 ed25519는
 * 항상 경화 파생만 허용한다고 못 박고 있고, 경화 파생은 반드시 부모 "개인"키가 있어야 한다).
 * 그래서 Solana/USDT(SPL)은 자동 파생 대신, 운영자가 오프라인에서 미리 여러 개의 받기 전용
 * 주소를 만들어서 CryptoWalletConfig.addressPool에 등록해두고 주문마다 하나씩 꺼내 쓰는
 * 방식으로 간다(src/lib/crypto/walletConfig.ts의 allocateDepositAddress 참고).
 *
 * 이 파일은 주소 "형식이 유효한지"만 가볍게 확인한다(base58, 32바이트) — 실제로 그 주소가
 * Solana 네트워크에 존재하는지는 중요하지 않다(아직 아무 트랜잭션도 없는 새 주소가 정상이다).
 */
import bs58 from "bs58";

export function isValidSolanaAddress(address: string): boolean {
  try {
    const decoded = bs58.decode(address.trim());
    return decoded.length === 32;
  } catch {
    return false;
  }
}
