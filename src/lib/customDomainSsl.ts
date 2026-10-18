import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ServerCategory } from "@/generated/prisma/enums";

const execFileAsync = promisify(execFile);

/**
 * burnae-web은 (보안상 이유로) 권한 없는 "burnae" 유저로 돌아가서 nginx 설정 쓰기, certbot
 * 실행, nginx reload를 직접 할 수 없다. 대신 sudoers(/etc/sudoers.d/burnae-custom-domain-ssl)로
 * "이 스크립트 경로 하나"만 암호 없이 root로 실행할 수 있게 허용해뒀고, 도메인 형식 검증과
 * 이 서버에 같이 떠 있는 다른 사이트와의 충돌 확인 같은 민감한 로직은 전부 그 스크립트
 * 안에서 이뤄진다 — Node 쪽은 그냥 결과(성공/실패 메시지)만 받아서 DB에 반영한다.
 */
const HELPER_SCRIPT = "/usr/local/sbin/burnae-custom-domain-ssl";

/** HTTP로 서비스하는 서버 종류만 자동 SSL 대상 — 마인크래프트는 raw TCP라 TLS가 의미 없다 */
export function isSslEligibleCategory(category: ServerCategory): boolean {
  return category === "GENERAL" || category === "DISCORD_BOT";
}

export interface ProvisionResult {
  ok: boolean;
  error?: string;
}

/**
 * DNS가 이미 우리 쪽을 가리키는 게 확인된(verified) 커스텀 도메인에 실제로 Let's Encrypt
 * 인증서를 발급하고, 그 도메인 → 컨테이너 IP:포트로 리버스 프록시하는 nginx vhost를 올린다.
 * 인증서 갱신은 이 서버에 이미 떠 있는 전역 certbot.timer(하루 2번)가 자동으로 처리한다.
 */
export async function provisionCustomDomainSsl(hostname: string, ip: string, port: number): Promise<ProvisionResult> {
  try {
    await execFileAsync("sudo", [HELPER_SCRIPT, "issue", hostname, ip, String(port)]);
    return { ok: true };
  } catch (err) {
    const message = extractStderr(err);
    return { ok: false, error: message.slice(0, 300) };
  }
}

/** 커스텀 도메인 연결 해제 시 vhost와 인증서를 정리한다 — 실패해도 도메인 삭제 자체는 막지 않는다 */
export async function revokeCustomDomainSsl(hostname: string): Promise<void> {
  try {
    await execFileAsync("sudo", [HELPER_SCRIPT, "revoke", hostname]);
  } catch (err) {
    console.error(`[customDomainSsl] ${hostname} 해제 실패:`, extractStderr(err));
  }
}

function extractStderr(err: unknown): string {
  if (err && typeof err === "object" && "stderr" in err) {
    const stderr = String((err as { stderr?: unknown }).stderr ?? "").trim();
    if (stderr) return stderr.replace(/^ERROR:\s*/, "");
  }
  return err instanceof Error ? err.message : String(err);
}
