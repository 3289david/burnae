import { SignJWT, jwtVerify } from "jose";

/**
 * LXC VPS 콘솔 웹소켓(burnae-lxc-console 독립 프로세스, src/scripts/lxc-console-server.ts)용
 * 전용 토큰. Wings 콘솔 토큰과 같은 역할(발급 = 명령 실행 권한까지 포함, 짧은 유효기간, 만료
 * 직전 재발급)이지만 완전히 분리된 purpose claim으로 서명해서 다른 용도(세션 로그인 등)의
 * AUTH_SECRET 서명 토큰과 섞여 쓰이는 사고를 막는다.
 */
const PURPOSE = "lxc-console";
const TTL_SECONDS = 90;

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET 환경변수가 설정되지 않았거나 너무 짧습니다 (16자 이상 필요).");
  }
  return new TextEncoder().encode(secret);
}

export async function signLxcConsoleToken(containerName: string): Promise<string> {
  return new SignJWT({ purpose: PURPOSE, containerName })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifyLxcConsoleToken(token: string): Promise<{ containerName: string }> {
  const { payload } = await jwtVerify(token, getSecretKey());
  if (payload.purpose !== PURPOSE || typeof payload.containerName !== "string") {
    throw new Error("잘못된 콘솔 토큰입니다.");
  }
  return { containerName: payload.containerName };
}
