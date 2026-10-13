import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/** "salt:hash" 형식의 hex 문자열로 반환 — 추가 패키지 없이 Node 내장 scrypt만 사용 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await scryptAsync(password, salt);
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, salt);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function isValidPassword(password: string): boolean {
  return typeof password === "string" && password.length >= 8 && password.length <= 72;
}

/** 복구 코드 하나가 목록(해시된 상태) 안에 있으면, 그 코드를 뺀 나머지 목록을 돌려준다(1회용 소모) */
export async function matchAndRemoveBackupCode(code: string, hashedCodes: string[]): Promise<string[] | null> {
  for (const hash of hashedCodes) {
    if (await verifyPassword(code, hash)) {
      return hashedCodes.filter((h) => h !== hash);
    }
  }
  return null;
}
