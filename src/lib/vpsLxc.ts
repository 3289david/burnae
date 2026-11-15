import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
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

/** stdin으로 입력을 넘겨야 하는 액션용(run-command, 파일 쓰기/업로드 등) — execFile은 stdin을
 * 못 써서 직접 spawn. 바이너리 파일(업로드/다운로드)도 다루므로 stdout은 Buffer로 모은다 —
 * 텍스트가 필요한 호출부는 .toString("utf8")로 직접 변환한다. */
function runHelperWithStdin(args: string[], input: string | Buffer, timeoutMs = 35_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("sudo", ["-n", HELPER_PATH, ...args]);
    const chunks: Buffer[] = [];
    let stderr = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("명령 실행 시간이 초과되었습니다.")); }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => { chunks.push(d); });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(stderr.trim() || `종료 코드 ${code}`));
      else resolve(Buffer.concat(chunks));
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}

/** 새 컨테이너를 만든다(부팅은 안 함) — name은 "vps-" + 서버 id 등으로 호출부에서 만들어 전달.
 * ramMb/cpuPercent를 주면 결제한 플랜만큼만 쓰도록 cgroup으로 강제한다(생성 시 바로 적용,
 * 디스크는 이 버전에서 하드 쿼터 없음 — 알려진 한계). */
export async function createVpsContainer(
  name: string,
  dist = "ubuntu",
  release = "jammy",
  ramMb?: number,
  cpuPercent?: number,
): Promise<void> {
  assertValidName(name);
  const args = ["create", name, dist, release];
  if (ramMb !== undefined || cpuPercent !== undefined) {
    args.push(String(ramMb ?? ""), String(cpuPercent ?? ""));
  }
  await runHelper(args);
}

/** 이미 만든 컨테이너의 RAM/CPU 한도를 바꾼다(플랜 업그레이드 등) — 재시작해야 반영된다. */
export async function setVpsContainerLimits(name: string, ramMb?: number, cpuPercent?: number): Promise<void> {
  assertValidName(name);
  await runHelper(["limit", name, String(ramMb ?? ""), String(cpuPercent ?? "")]);
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

/** 강제 종료(정상 종료가 멈춰있을 때) — lxc-stop -k */
export async function killVpsContainer(name: string): Promise<void> {
  assertValidName(name);
  await runHelper(["kill", name]);
}

/** 대시보드 자원 그래프용 — RAM/CPU/디스크 현재 사용량(읽기 전용, 즉시 반환). */
export async function getVpsContainerStats(
  name: string,
): Promise<{ memBytes: number; memMaxBytes: number; cpuUsageUsec: number; diskKb: number }> {
  assertValidName(name);
  const output = await runHelper(["stats", name]);
  return JSON.parse(output);
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

/** 콘솔 REST/AI 툴/예약 작업처럼 한 번 실행하고 결과만 받으면 되는 명령 — Pterodactyl
 * sendConsoleCommand와 동등한 "fire-and-forget + 베스트에포트 출력"용. */
export async function runVpsCommand(name: string, command: string): Promise<string> {
  assertValidName(name);
  const buf = await runHelperWithStdin(["run-command", name], command);
  return buf.toString("utf8");
}

/** 대시보드 콘솔용 — 컨테이너에 pty로 붙은 대화형 bash 프로세스를 하나 띄워서 돌려준다.
 * 호출한 쪽(콘솔 WS 서버)이 stdin에 명령을 써넣고 stdout/stderr를 스트리밍으로 읽으면 된다.
 * 소켓 연결이 끝나면 호출한 쪽에서 반드시 kill() 해야 한다(계속 떠 있는 프로세스임). */
export function spawnVpsConsoleShell(name: string): ChildProcessWithoutNullStreams {
  assertValidName(name);
  return spawn("sudo", ["-n", HELPER_PATH, "attach-shell", name], { stdio: ["pipe", "pipe", "pipe"] });
}

/** 생성(+RAM/CPU 한도 적용) → 시작 → IP 할당 대기 → SSH 설정까지 한 번에 처리하고, 바로
 * DB에 저장할 수 있는 접속 정보를 돌려준다. */
export async function provisionVpsContainer(
  name: string,
  ramMb: number,
  cpuPercent: number,
  dist = "ubuntu",
  release = "jammy",
): Promise<{ ip: string; sshPort: number; password: string }> {
  await createVpsContainer(name, dist, release, ramMb, cpuPercent);
  await startVpsContainer(name);
  const ip = await getVpsContainerIp(name);
  const password = await setupVpsContainerSsh(name);
  return { ip, sshPort: 22, password };
}

/** 파일관리자용 — Pterodactyl의 FileObject와 같은 모양으로 맞춘다(프론트가 이미 그 모양을
 * 기대하고 있어서 FilesTab.tsx를 안 건드려도 됨). 실제로는 lxc-attach 없이 호스트에서 바로
 * rootfs를 읽는다(권한을 그대로 쓰는 특권(privileged) 컨테이너라 UID가 호스트와 1:1 대응). */
export interface VpsFileObject {
  name: string;
  mode: string;
  size: number;
  is_file: boolean;
  is_symlink: boolean;
  is_editable: boolean;
  mimetype: string;
  created_at: string;
  modified_at: string;
}

export async function listVpsFiles(name: string, dir: string): Promise<VpsFileObject[]> {
  assertValidName(name);
  const out = await runHelper(["file-list", name, dir]);
  return JSON.parse(out);
}

export async function readVpsFile(name: string, file: string): Promise<string> {
  assertValidName(name);
  const buf = await runHelperWithStdin(["file-read", name, file], "");
  return buf.toString("utf8");
}

export async function writeVpsFile(name: string, file: string, content: string): Promise<void> {
  assertValidName(name);
  await runHelperWithStdin(["file-write", name, file], content);
}

export async function downloadVpsFile(name: string, file: string): Promise<Buffer> {
  assertValidName(name);
  return runHelperWithStdin(["file-download", name, file], "", 60_000);
}

export async function writeVpsFileBinary(name: string, file: string, content: Buffer): Promise<void> {
  assertValidName(name);
  await runHelperWithStdin(["file-write-binary", name, file], content, 60_000);
}

export async function deleteVpsFiles(name: string, dir: string, files: string[]): Promise<void> {
  assertValidName(name);
  await runHelper(["file-delete", name, dir, ...files]);
}

export async function renameVpsFile(name: string, dir: string, from: string, to: string): Promise<void> {
  assertValidName(name);
  await runHelper(["file-rename", name, dir, from, to]);
}

export async function copyVpsFile(name: string, location: string): Promise<void> {
  assertValidName(name);
  await runHelper(["file-copy", name, location]);
}

export async function createVpsFolder(name: string, dir: string, folderName: string): Promise<void> {
  assertValidName(name);
  await runHelper(["file-folder", name, dir, folderName]);
}

export async function compressVpsFiles(name: string, dir: string, files: string[]): Promise<VpsFileObject> {
  assertValidName(name);
  const out = await runHelper(["file-compress", name, dir, ...files]);
  return JSON.parse(out);
}

export async function decompressVpsFile(name: string, dir: string, file: string): Promise<void> {
  assertValidName(name);
  await runHelper(["file-decompress", name, dir, file]);
}
