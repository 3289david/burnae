/**
 * Cloudflare DNS 자동화 — 서버 생성 시 서브도메인(A) + SRV 레코드를 자동 생성하고,
 * 서버 삭제 시 자동으로 정리한다. 고객은 "친구들smp.krl.kr" 처럼 포트 번호 없이 접속 가능.
 *
 * 존(zone)은 krl.kr 을 사용한다 (서비스 자체 도메인 burnae.kr 과는 별도).
 * https://developers.cloudflare.com/api/operations/dns-records-for-a-zone-create-dns-record
 */

const CF_BASE = "https://api.cloudflare.com/client/v4";

class CloudflareError extends Error {
  constructor(message: string, public detail?: unknown) {
    super(message);
    this.name = "CloudflareError";
  }
}

async function cf<T>(path: string, init?: RequestInit): Promise<T> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!token || !zoneId) {
    throw new Error(
      "CLOUDFLARE_API_TOKEN / CLOUDFLARE_ZONE_ID 환경변수가 설정되지 않았습니다.",
    );
  }

  const res = await fetch(`${CF_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  const body = await res.json();
  if (!res.ok || body.success === false) {
    const message =
      body?.errors?.[0]?.message ?? `Cloudflare API 요청 실패 (${res.status})`;
    throw new CloudflareError(message, body?.errors);
  }
  return body;
}

function zonePath(suffix = "") {
  return `/zones/${process.env.CLOUDFLARE_ZONE_ID}/dns_records${suffix}`;
}

/** 부제 슬러그를 만든다: 한글/공백 제거, 소문자 영숫자-하이픈만, 최대 32자 */
export function slugifySubdomain(input: string, fallback: string): string {
  const ascii = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const slug = ascii.length >= 3 ? ascii : fallback;
  // 32자로 자르면 그 지점이 하필 "-" 바로 뒤일 수 있어(예: 한글이 전부 "x-"로 치환된 경우),
  // 자른 뒤에도 끝에 남은 "-"를 다시 한번 정리한다
  return slug.slice(0, 32).replace(/-+$/, "");
}

export interface DnsRecordIds {
  aRecordId: string;
  srvRecordId: string;
}

/**
 * 서버용 A 레코드 + SRV 레코드(_minecraft._tcp) 생성.
 * subdomain: "friends-smp" (krl.kr 존 기준 서브도메인, 점 포함 안 함)
 * nodePublicIp / nodeFqdn: 서버가 배치된 노드 정보
 * port: Pterodactyl allocation 포트
 */
export async function createServerDnsRecords(params: {
  subdomain: string;
  nodePublicIp: string;
  nodeFqdn: string;
  port: number;
}): Promise<DnsRecordIds> {
  const zone = process.env.CLOUDFLARE_SUBDOMAIN_ZONE ?? "krl.kr";
  const fqdn = `${params.subdomain}.${zone}`;

  const aRecord = await cf<{ result: { id: string } }>(zonePath(), {
    method: "POST",
    body: JSON.stringify({
      type: "A",
      name: fqdn,
      content: params.nodePublicIp,
      ttl: 300,
      proxied: false, // 마인크래프트 TCP 트래픽은 Cloudflare 프록시를 거치면 안 됨
      comment: "Burnae 서버 자동 생성",
    }),
  });

  let srvRecord: { result: { id: string } };
  try {
    srvRecord = await cf<{ result: { id: string } }>(zonePath(), {
      method: "POST",
      body: JSON.stringify({
        type: "SRV",
        // Cloudflare는 최상위 name(_service._proto.호스트 전체)과 data.name(호스트 부분만, service/proto 접두어 없이)이
        // 둘 다 필요하다 — 둘 중 하나라도 빠지거나 형식이 다르면 "DNS name is invalid"(9000)로 거부된다.
        name: `_minecraft._tcp.${fqdn}`,
        data: {
          service: "_minecraft",
          proto: "_tcp",
          name: params.subdomain,
          priority: 0,
          weight: 5,
          port: params.port,
          target: params.nodeFqdn,
        },
        ttl: 300,
        comment: "Burnae 서버 자동 생성",
      }),
    });
  } catch (err) {
    // SRV 생성이 실패하면 A 레코드만 고아로 남아 그 서브도메인이 영영 "사용 중"으로 막힌다 —
    // 실패 시 방금 만든 A 레코드도 같이 지워서 이 함수가 통째로 성공하거나 실패하게 한다
    await deleteServerDnsRecords({ aRecordId: aRecord.result.id }).catch(() => {});
    throw err;
  }

  return { aRecordId: aRecord.result.id, srvRecordId: srvRecord.result.id };
}

/**
 * 서버가 다른 노드로 이전된 뒤, 기존 A/SRV 레코드가 새 노드의 IP/FQDN/포트를 가리키도록 갱신한다.
 * 레코드를 지웠다 새로 만들면 그 사이 DNS가 잠깐 끊기므로, PATCH로 내용만 바꿔 끊김을 최소화한다.
 */
export async function updateServerDnsRecords(params: {
  aRecordId: string;
  srvRecordId: string;
  subdomain: string;
  nodePublicIp: string;
  nodeFqdn: string;
  port: number;
}): Promise<void> {
  const zone = process.env.CLOUDFLARE_SUBDOMAIN_ZONE ?? "krl.kr";
  const fqdn = `${params.subdomain}.${zone}`;

  await cf(zonePath(`/${params.aRecordId}`), {
    method: "PATCH",
    body: JSON.stringify({ content: params.nodePublicIp }),
  });

  try {
    await cf(zonePath(`/${params.srvRecordId}`), {
      method: "PATCH",
      body: JSON.stringify({
        name: `_minecraft._tcp.${fqdn}`,
        data: {
          service: "_minecraft",
          proto: "_tcp",
          name: params.subdomain,
          priority: 0,
          weight: 5,
          port: params.port,
          target: params.nodeFqdn,
        },
      }),
    });
  } catch (err) {
    // A 레코드는 이미 새 IP로 바뀐 상태 — SRV까지 실패하면 A/SRV가 서로 다른 노드를 가리키는
    // 불일치 상태로 남으니, 호출하는 쪽 로그에서 바로 알아볼 수 있게 명확히 표시한다
    throw new Error(
      `A 레코드는 ${params.nodePublicIp}로 갱신됐지만 SRV 레코드 갱신에 실패했습니다 — DNS가 새 노드와 옛 노드로 갈라져 있을 수 있어 수동 확인이 필요합니다: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function deleteServerDnsRecords(ids: Partial<DnsRecordIds>) {
  const deletions: Promise<unknown>[] = [];
  if (ids.aRecordId) {
    deletions.push(cf(zonePath(`/${ids.aRecordId}`), { method: "DELETE" }));
  }
  if (ids.srvRecordId) {
    deletions.push(cf(zonePath(`/${ids.srvRecordId}`), { method: "DELETE" }));
  }
  // 하나가 실패해도 나머지는 시도 (레코드가 이미 지워졌을 수 있음)
  await Promise.allSettled(deletions);
}

/** 서브도메인 중복 여부 확인 (DB에 없어도 Cloudflare에 이미 존재할 수 있음) */
export async function isSubdomainTaken(subdomain: string): Promise<boolean> {
  const zone = process.env.CLOUDFLARE_SUBDOMAIN_ZONE ?? "krl.kr";
  const fqdn = `${subdomain}.${zone}`;
  const res = await cf<{ result: unknown[] }>(
    zonePath(`?name=${encodeURIComponent(fqdn)}`),
  );
  return res.result.length > 0;
}
