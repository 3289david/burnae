import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PrismaClient } from "@/generated/prisma/client";

const execFileAsync = promisify(execFile);

/**
 * 마인크래프트 외 서버(VPS/디스코드봇/일반)는 name.krl.kr:포트로 접속해야 했는데, 브라우저는
 * 마인크래프트처럼 SRV 레코드로 포트를 자동으로 찾지 못해서 포트를 항상 같이 적어야 했다.
 * 이 함수는 그 서버들을 name.krl.kr(포트 없이)로도 접속할 수 있게, "서브도메인 → 실제 컨테이너
 * IP:포트" 매핑 파일을 최신 상태로 다시 써주고, 바뀌었으면 nginx를 reload한다.
 *
 * 이 매핑 파일은 두 군데서 include된다:
 *  1. /etc/nginx/sites-enabled/burnae-app-proxy.conf (Burnae 전용 *.app.krl.kr 와일드카드 —
 *     자체 Let's Encrypt 와일드카드 인증서로 TLS 처리, 항상 동작하는 폴백 경로)
 *  2. /etc/nginx/sites-enabled/krl.kr (별도 SaaS인 krl.kr 자체 서비스의 기존 *.krl.kr 와일드카드
 *     vhost에 추가한 짧은 분기 — 매핑에 있으면 Burnae로, 없으면 원래 krl.kr 핸들러로 그대로 진행)
 * 두 nginx 설정 파일 모두 이 저장소 밖(/etc/nginx)에 있어 여기서 직접 관리하지 않는다.
 *
 * 지금은 노드가 1대뿐이라 이 nginx 설정이 이 서버 자신에 있다고 가정한다 — 노드가 여러 대로
 * 늘어나면 노드별로 이 프록시를 각자 두거나(각 노드에 자기 서버들만 매핑), 중앙 프록시 계층을
 * 따로 둬야 한다.
 */
const MAP_FILE_PATH = "/etc/burnae/app-proxy-map.conf";

export async function syncAppProxyMap(prisma: PrismaClient) {
  const servers = await prisma.server.findMany({
    where: {
      deletedAt: null,
      allocationPort: { not: null },
      allocationIp: { not: null },
      template: { category: { in: ["GENERAL", "DISCORD_BOT"] } },
    },
    include: { subdomains: { where: { isPrimary: true }, take: 1 } },
  });

  // Wings가 발행하는 도커 포트는 노드의 공인 IP에만 바인딩되고 127.0.0.1(loopback)에는 안 열려있어서
  // nginx도 그 공인 IP:포트로 직접 proxy_pass 해야 한다
  const lines = servers
    .filter((s) => s.subdomains[0])
    .map((s) => `    ${JSON.stringify(s.subdomains[0].subdomain)} ${s.allocationIp}:${s.allocationPort};`);
  const content = lines.length > 0 ? lines.join("\n") + "\n" : "";

  const existing = fs.existsSync(MAP_FILE_PATH) ? fs.readFileSync(MAP_FILE_PATH, "utf-8") : null;
  if (existing === content) return { changed: false, count: lines.length };

  // 이 파일은 krl.kr(별도 서비스)의 vhost에도 include돼서, 문법이 깨진 채로 덮어쓰면 nginx 전체가
  // reload/재시작 시 죽을 수 있다 — 그래서 임시 파일에 먼저 쓰고 `nginx -t`로 통과하는 걸 확인한
  // 뒤에만 실제 경로로 옮긴다(원자적 rename). 검증 실패 시 기존 파일은 그대로 남는다.
  const tmpPath = `${MAP_FILE_PATH}.tmp`;
  fs.writeFileSync(tmpPath, content);
  try {
    fs.renameSync(tmpPath, MAP_FILE_PATH);
    await execFileAsync("nginx", ["-t"]);
  } catch (err) {
    // 검증 실패 — 가능하면 이전 내용으로 되돌려서 nginx가 계속 정상 동작하게 한다
    if (existing !== null) fs.writeFileSync(MAP_FILE_PATH, existing);
    throw err;
  }
  await execFileAsync("systemctl", ["reload", "nginx"]);
  return { changed: true, count: lines.length };
}
