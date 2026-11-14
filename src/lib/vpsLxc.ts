import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * LXC 기반 "VPS" 컨테이너 수명주기 관리 — Pterodactyl/Docker가 아니라 이 호스트에 직접 만든
 * 진짜 OS 수준 가상화(LXC) 컨테이너다. burnae 앱 유저는 root 권한이 없어서, 실제 lxc-*
 * 명령은 scope를 좁힌 root 전용 헬퍼(/usr/local/sbin/burnae-vps-lxc, sudoers로 그 경로
 * 하나만 암호 없이 허용)를 통해서만 실행한다 — 헬퍼 스크립트 안에서 컨테이너 이름이 반드시
 * "vps-"로 시작하도록 다시 한번 강제 검증하므로, 이 코드가 다른 LXC 컨테이너나 시스템
 * 자원을 건드릴 수 없다.
 *
 * 네트워킹: 컨테이너는 lxcbr0(10.0.3.0/24, 이 호스트 전용 사설 브릿지)에서 DHCP로 사설 IP를
 * 받는다. ssh burnae.kr 게이트웨이(ssh-gateway/)가 이 앱과 같은 호스트에서 돌기 때문에,
 * 공인 IP나 포트포워딩 없이 그 사설 IP로 바로 SSH를 붙일 수 있다 — Pterodactyl 서버가
 * allocationIp/sshPort/accessSecret로 SSH 게이트웨이에 연결되는 것과 완전히 같은 방식이라
 * 기존 ssh-gateway 연결 로직(connect/servers 라우트)을 그대로 재사용한다.
 */
const HELPER_PATH = "/usr/local/sbin/burnae-vps-lxc";
const VPS_NAME_PATTERN = /^vps-[a-z0-9-]{1,40}$/;

function assertValidName(name: string) {
  if (!VPS_NAME_PATTERN.test(name)) {
    throw new Error(`잘못된 VPS 컨테이너 이름입니다: ${name}`);
  }
}

async function runHelper(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("sudo", ["-n", HELPER_PATH, ...args], { timeout: 120_000 });
  return stdout.trim();
}

/** 새 컨테이너를 만든다(부팅은 안 함) — name은 "vps-" + 서버 id 등으로 호출부에서 만들어 전달 */
export async function createVpsContainer(name: string, dist = "ubuntu", release = "jammy"): Promise<void> {
  assertValidName(name);
  await runHelper(["create", name, dist, release]);
}

export async function startVpsContainer(name: string): Promise<void> {
  assertValidName(name);
  await runHelper(["start", name]);
}

export async function stopVpsContainer(name: string): Promise<void> {
  assertValidName(name);
  await runHelper(["stop", name]);
}

export async function restartVpsContainer(name: string): Promise<void> {
  assertValidName(name);
  await runHelper(["restart", name]);
}

export async function destroyVpsContainer(name: string): Promise<void> {
  assertValidName(name);
  await runHelper(["destroy", name]);
}

/** DHCP 할당을 기다렸다가 사설 IP를 돌려준다(헬퍼 쪽에서 최대 20초 재시도) */
export async function getVpsContainerIp(name: string): Promise<string> {
  assertValidName(name);
  return runHelper(["ip", name]);
}

/** openssh-server 설치 + container 유저를 새 무작위 비밀번호로 설정하고 반환한다.
 * 비밀번호는 헬퍼 스크립트가 직접 생성해서 stdout으로만 돌려준다(인자로 전달 안 함 — ps 목록
 * 노출 방지). */
export async function setupVpsContainerSsh(name: string): Promise<string> {
  assertValidName(name);
  const output = await runHelper(["setup-ssh", name]);
  const match = output.match(/^PASSWORD=(.+)$/m);
  if (!match) throw new Error("SSH 설정 응답에서 비밀번호를 찾지 못했습니다.");
  return match[1];
}

/** 생성 → 시작 → IP 할당 대기 → SSH 설정까지 한 번에 처리하고, 바로 DB에 저장할 수 있는
 * 접속 정보를 돌려준다. */
export async function provisionVpsContainer(
  name: string,
  dist = "ubuntu",
  release = "jammy",
): Promise<{ ip: string; sshPort: number; password: string }> {
  await createVpsContainer(name, dist, release);
  await startVpsContainer(name);
  const ip = await getVpsContainerIp(name);
  const password = await setupVpsContainerSsh(name);
  return { ip, sshPort: 22, password };
}
