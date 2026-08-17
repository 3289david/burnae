import dns from "node:dns/promises";

/**
 * 고객이 소유한 외부 도메인을 서버에 연결하는 기능.
 * krl.kr 서브도메인과 달리 Cloudflare API로 우리가 직접 레코드를 만들 수 없으므로,
 * 고객이 자기 DNS에 SRV(+A) 레코드를 직접 등록하고, 우리는 조회로 확인만 한다.
 */

const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function isValidHostname(hostname: string): boolean {
  return HOSTNAME_RE.test(hostname);
}

export interface DomainVerifyTarget {
  ip: string;
  port: number;
}

export interface DomainVerifyResult {
  verified: boolean;
  reason: string;
}

/**
 * SRV(_minecraft._tcp.<host>)가 포트까지 정확히 가리키면 최우선으로 인정.
 * SRV가 없으면 A 레코드가 서버 IP를 가리키는지만 확인(포트는 기본 25565 전제).
 */
export async function verifyCustomDomain(
  hostname: string,
  target: DomainVerifyTarget,
): Promise<DomainVerifyResult> {
  try {
    const srvRecords = await dns.resolveSrv(`_minecraft._tcp.${hostname}`);
    const match = srvRecords.some((r) => r.port === target.port);
    if (match) {
      const targetHost = srvRecords.find((r) => r.port === target.port)!.name;
      const resolved = await dns.resolve4(targetHost).catch((): string[] => []);
      if (resolved.includes(target.ip)) {
        return { verified: true, reason: "SRV 레코드 확인됨" };
      }
      return { verified: false, reason: "SRV는 있지만 대상 IP가 일치하지 않아요." };
    }
  } catch {
    // SRV 없음 — A 레코드로 폴백
  }

  try {
    const aRecords = await dns.resolve4(hostname);
    if (aRecords.includes(target.ip)) {
      if (target.port !== 25565) {
        return {
          verified: false,
          reason: `A 레코드는 확인됐지만 포트가 ${target.port}이라 SRV 레코드도 필요해요.`,
        };
      }
      return { verified: true, reason: "A 레코드 확인됨 (기본 포트 25565)" };
    }
    return { verified: false, reason: "A 레코드가 서버 IP를 가리키지 않아요." };
  } catch {
    return { verified: false, reason: "DNS 레코드를 찾을 수 없어요. 아직 전파 중일 수 있어요." };
  }
}
