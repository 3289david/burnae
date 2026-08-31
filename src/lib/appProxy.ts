import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PrismaClient } from "@/generated/prisma/client";

const execFileAsync = promisify(execFile);

/**
 * 마인크래프트 외 서버(VPS/디스코드봇/일반)는 name.krl.kr:포트로 접속해야 했는데, 브라우저는
 * 마인크래프트처럼 SRV 레코드로 포트를 자동으로 찾지 못해서 포트를 항상 같이 적어야 했다.
 * 이 함수는 그 서버들을 name.app.krl.kr(포트 없이)로도 접속할 수 있게, nginx가 참조하는
 * "서브도메인 → 실제 컨테이너 포트" 매핑 파일을 최신 상태로 다시 써주고, 바뀌었으면 nginx를
 * reload한다. (*.app.krl.kr은 Cloudflare에서 이 노드로 프록시되는 와일드카드 A 레코드 — 기존
 * krl.kr 서비스(별도 SaaS)의 라벨 1개짜리 와일드카드 vhost와는 겹치지 않는 라벨 2개짜리 이름이라
 * 안전하다.)
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

  fs.writeFileSync(MAP_FILE_PATH, content);
  await execFileAsync("nginx", ["-t"]);
  await execFileAsync("systemctl", ["reload", "nginx"]);
  return { changed: true, count: lines.length };
}
