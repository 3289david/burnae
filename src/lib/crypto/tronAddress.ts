import * as ecc from "tiny-secp256k1";
import { BIP32Factory } from "bip32";
import { keccak256 } from "js-sha3";
import bs58check from "bs58check";

const bip32 = BIP32Factory(ecc);

/** TRON 메인넷 주소 접두 바이트(0x41) — Base58Check 인코딩 전에 20바이트 해시 앞에 붙인다 */
const TRON_ADDRESS_PREFIX = 0x41;

/**
 * xpub(BIP32 확장 "공개"키)에서 TRON 주소를 파생한다 — 개인키는 전혀 필요 없다.
 * TRON은 Bitcoin/Ethereum과 같은 secp256k1 곡선을 쓰기 때문에 공개키만으로 비경화
 * (non-hardened) 자식 키를 파생할 수 있다. 주소 인코딩은 Ethereum과 동일한 방식
 * (공개키의 keccak256 해시 뒤 20바이트)에 TRON 전용 접두 바이트(0x41)만 다르다.
 *
 * 파생 경로: m/0/{index} (BIP44의 "external" 체인, 흔히 쓰는 수신 주소 관례).
 * 지갑 앱에서 xpub을 내보낼 때 이미 m/44'/195'/0' 계정까지 경화 파생을 끝낸 상태라고
 * 가정한다 — 그래서 여기서는 비경화 단계(0/index)만 더 파생하면 된다.
 */
export function deriveTronAddress(xpub: string, index: number): string {
  const accountNode = bip32.fromBase58(xpub);
  const child = accountNode.derive(0).derive(index);

  // 33바이트 압축 공개키 → 65바이트 비압축 공개키(0x04 + X32 + Y32)로 바꾼 뒤 0x04를 떼어낸다
  const uncompressed = ecc.pointCompress(child.publicKey, false);
  const pubKeyNoPrefix = uncompressed.subarray(1);

  const hash = keccak256.array(pubKeyNoPrefix);
  const last20 = Buffer.from(hash.slice(-20));
  const addressBytes = Buffer.concat([Buffer.from([TRON_ADDRESS_PREFIX]), last20]);

  return bs58check.encode(addressBytes);
}

/** xpub이 실제로 파싱 가능한 형식인지만 빠르게 확인한다(관리자 저장 시 즉시 피드백용) */
export function isValidXpub(xpub: string): boolean {
  try {
    const node = bip32.fromBase58(xpub);
    return !node.privateKey; // 혹시 실수로 확장 "개인"키(xprv)를 넣었으면 거부한다
  } catch {
    return false;
  }
}
