import WebSocket from "ws";
import { clientRequest } from "./shared";

/**
 * Pterodactyl Client API wrapper — 콘솔/전원/파일/백업 등 서버 실사용 조작.
 * 서버 소유자 구분 없이 모든 서버를 다룰 수 있도록, 관리자 권한을 가진
 * 서비스 계정의 Client API 키(PTERODACTYL_CLIENT_API_KEY)를 사용한다.
 * (Pterodactyl 패널 설정에서 해당 관리자 계정이 전체 서버에 접근 가능해야 함)
 */

export type PowerSignal = "start" | "stop" | "restart" | "kill";

export async function sendPowerAction(
  identifier: string,
  signal: PowerSignal,
): Promise<void> {
  await clientRequest(`/api/client/servers/${identifier}/power`, {
    method: "POST",
    body: JSON.stringify({ signal }),
  });
}

export async function sendConsoleCommand(
  identifier: string,
  command: string,
): Promise<void> {
  await clientRequest(`/api/client/servers/${identifier}/command`, {
    method: "POST",
    body: JSON.stringify({ command }),
  });
}

export interface ServerResources {
  current_state: "starting" | "running" | "stopping" | "offline";
  is_suspended: boolean;
  resources: {
    memory_bytes: number;
    cpu_absolute: number;
    disk_bytes: number;
    network_rx_bytes: number;
    network_tx_bytes: number;
    uptime: number;
  };
}

export async function getServerResources(
  identifier: string,
): Promise<ServerResources> {
  const res = await clientRequest<{ object: string; attributes: ServerResources }>(
    `/api/client/servers/${identifier}/resources`,
  );
  return res.attributes;
}

export interface FileObject {
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

export async function listFiles(
  identifier: string,
  directory = "/",
): Promise<FileObject[]> {
  const res = await clientRequest<{
    object: string;
    data: { object: string; attributes: FileObject }[];
  }>(
    `/api/client/servers/${identifier}/files/list?directory=${encodeURIComponent(directory)}`,
  );
  return res.data.map((d) => d.attributes);
}

export async function readFile(
  identifier: string,
  file: string,
): Promise<string> {
  return clientRequest<string>(
    `/api/client/servers/${identifier}/files/contents?file=${encodeURIComponent(file)}`,
    undefined,
    true,
  );
}

export async function writeFile(
  identifier: string,
  file: string,
  content: string,
): Promise<void> {
  await clientRequest(
    `/api/client/servers/${identifier}/files/write?file=${encodeURIComponent(file)}`,
    {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: content,
    },
  );
}

/** 플러그인/모드 .jar 같은 바이너리 파일을 서버에 업로드한다 */
export async function writeBinaryFile(
  identifier: string,
  file: string,
  content: ArrayBuffer,
): Promise<void> {
  await clientRequest(
    `/api/client/servers/${identifier}/files/write?file=${encodeURIComponent(file)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: content,
    },
  );
}

/**
 * 1회용 업로드 URL을 발급한다. 브라우저가 우리 서버를 거치지 않고
 * 이 URL로 직접 multipart/form-data POST 해서 파일을 올린다(대용량 스트리밍 회피).
 */
export async function getUploadUrl(identifier: string, directory: string): Promise<string> {
  const res = await clientRequest<{ object: string; attributes: { url: string } }>(
    `/api/client/servers/${identifier}/files/upload?directory=${encodeURIComponent(directory)}`,
  );
  return res.attributes.url;
}

/** 1회용 다운로드 URL을 발급한다. 브라우저가 이 URL로 직접 접속해서 받는다. */
export async function getDownloadUrl(identifier: string, file: string): Promise<string> {
  const res = await clientRequest<{ object: string; attributes: { url: string } }>(
    `/api/client/servers/${identifier}/files/download?file=${encodeURIComponent(file)}`,
  );
  return res.attributes.url;
}

export async function compressFiles(
  identifier: string,
  directory: string,
  files: string[],
): Promise<FileObject> {
  const res = await clientRequest<{ object: string; attributes: FileObject }>(
    `/api/client/servers/${identifier}/files/compress`,
    { method: "POST", body: JSON.stringify({ root: directory, files }) },
  );
  return res.attributes;
}

export async function decompressFile(
  identifier: string,
  directory: string,
  file: string,
): Promise<void> {
  await clientRequest(`/api/client/servers/${identifier}/files/decompress`, {
    method: "POST",
    body: JSON.stringify({ root: directory, file }),
  });
}

export async function deleteFiles(
  identifier: string,
  directory: string,
  files: string[],
): Promise<void> {
  await clientRequest(`/api/client/servers/${identifier}/files/delete`, {
    method: "POST",
    body: JSON.stringify({ root: directory, files }),
  });
}

export async function renameFile(
  identifier: string,
  directory: string,
  from: string,
  to: string,
): Promise<void> {
  await clientRequest(`/api/client/servers/${identifier}/files/rename`, {
    method: "PUT",
    body: JSON.stringify({ root: directory, files: [{ from, to }] }),
  });
}

/** 파일/폴더를 다른 위치로 옮긴다. renameFile과 같은 API를 쓰지만 root가 아닌 목적지 경로를 to에 넣는다 */
export async function moveFiles(
  identifier: string,
  directory: string,
  items: { from: string; to: string }[],
): Promise<void> {
  await clientRequest(`/api/client/servers/${identifier}/files/rename`, {
    method: "PUT",
    body: JSON.stringify({ root: directory, files: items }),
  });
}

export async function createFolder(
  identifier: string,
  directory: string,
  name: string,
): Promise<void> {
  await clientRequest(`/api/client/servers/${identifier}/files/create-folder`, {
    method: "POST",
    body: JSON.stringify({ root: directory, name }),
  });
}

/** 같은 디렉토리 안에서 파일/폴더를 복사한다(Pterodactyl이 자동으로 " copy" 접미사를 붙임) */
export async function copyFile(identifier: string, location: string): Promise<void> {
  await clientRequest(`/api/client/servers/${identifier}/files/copy`, {
    method: "POST",
    body: JSON.stringify({ location }),
  });
}

export interface PteroBackup {
  uuid: string;
  name: string;
  ignored_files: string[];
  is_successful: boolean;
  is_locked: boolean;
  checksum: string | null;
  bytes: number;
  created_at: string;
  completed_at: string | null;
}

export async function listBackups(identifier: string): Promise<PteroBackup[]> {
  const res = await clientRequest<{
    object: string;
    data: { object: string; attributes: PteroBackup }[];
  }>(`/api/client/servers/${identifier}/backups`);
  return res.data.map((d) => d.attributes);
}

export async function createBackup(
  identifier: string,
  name: string,
): Promise<PteroBackup> {
  const res = await clientRequest<{ object: string; attributes: PteroBackup }>(
    `/api/client/servers/${identifier}/backups`,
    { method: "POST", body: JSON.stringify({ name }) },
  );
  return res.attributes;
}

export async function deleteBackup(
  identifier: string,
  backupUuid: string,
): Promise<void> {
  await clientRequest(
    `/api/client/servers/${identifier}/backups/${backupUuid}`,
    { method: "DELETE" },
  );
}

/** 실수로 삭제/자동 정리되지 않게 백업을 잠그거나 잠금 해제한다 */
export async function toggleBackupLock(
  identifier: string,
  backupUuid: string,
): Promise<PteroBackup> {
  const res = await clientRequest<{ object: string; attributes: PteroBackup }>(
    `/api/client/servers/${identifier}/backups/${backupUuid}/lock`,
    { method: "POST" },
  );
  return res.attributes;
}

export async function restoreBackup(
  identifier: string,
  backupUuid: string,
): Promise<void> {
  await clientRequest(
    `/api/client/servers/${identifier}/backups/${backupUuid}/restore`,
    { method: "POST", body: JSON.stringify({ truncate: true }) },
  );
}

export interface StartupVariable {
  name: string;
  description: string;
  envVariable: string;
  serverValue: string;
  isEditable: boolean;
  rules: string;
}

/**
 * egg가 요구하는 시작 변수(토큰, API 키 등) 목록과 현재 값을 가져온다 — Red/Muse 같은 봇
 * egg는 토큰이 없으면 아예 실행이 안 되니, 유저가 서버 설정에서 직접 채워 넣어야 한다.
 */
export async function getStartupVariables(identifier: string): Promise<StartupVariable[]> {
  const res = await clientRequest<{
    data: {
      attributes: {
        name: string;
        description: string;
        env_variable: string;
        server_value: string;
        is_editable: boolean;
        rules: string;
      };
    }[];
  }>(`/api/client/servers/${identifier}/startup`);
  return res.data.map((d) => ({
    name: d.attributes.name,
    description: d.attributes.description,
    envVariable: d.attributes.env_variable,
    serverValue: d.attributes.server_value,
    isEditable: d.attributes.is_editable,
    rules: d.attributes.rules,
  }));
}

export async function updateStartupVariable(identifier: string, key: string, value: string): Promise<void> {
  await clientRequest(`/api/client/servers/${identifier}/startup/variable`, {
    method: "PUT",
    body: JSON.stringify({ key, value }),
  });
}

/** egg 설치 스크립트를 다시 실행한다 — 커스텀 GitHub repo 배포가 꼬였거나 초기 상태로 되돌리고 싶을 때 사용 (VPS/봇 서버에 특히 유용) */
export async function reinstallServer(identifier: string): Promise<void> {
  await clientRequest(`/api/client/servers/${identifier}/settings/reinstall`, {
    method: "POST",
  });
}

/** 콘솔 실시간 스트림용 웹소켓 인증 정보 발급 */
export async function getWebsocketCredentials(
  identifier: string,
): Promise<{ token: string; socket: string }> {
  const res = await clientRequest<{
    data: { token: string; socket: string };
  }>(`/api/client/servers/${identifier}/websocket`);
  return res.data;
}

/**
 * 서버 콘솔에 짧게 접속해 최근 출력(Wings가 접속 시 보내주는 backlog 포함)을 수집한다.
 * AI가 "서버 로그 확인해줘" 같은 요청을 처리할 때 사용 — 실시간 실제 데이터, 가짜 로그 없음.
 */
export async function captureRecentConsoleOutput(
  identifier: string,
  windowMs = 2500,
): Promise<string[]> {
  const { token, socket } = await getWebsocketCredentials(identifier);
  const lines: string[] = [];

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(socket, { headers: { Origin: process.env.PTERODACTYL_URL } });
    const timer = setTimeout(() => {
      ws.close();
    }, windowMs);

    ws.on("open", () => {
      ws.send(JSON.stringify({ event: "auth", args: [token] }));
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { event: string; args?: string[] };
        if (msg.event === "console output" && msg.args?.[0]) {
          lines.push(msg.args[0]);
        }
      } catch {
        // 파싱 불가한 프레임은 무시
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    ws.on("close", () => {
      clearTimeout(timer);
      resolve(lines.slice(-200));
    });
  });
}

/**
 * 콘솔 명령을 실행하고, 그 직후 나오는 출력을 수집한다.
 * "/list" 로 실제 접속 중인 플레이어를 확인하는 등 RCON 없이 명령 결과를 읽어야 할 때 사용.
 */
export async function runCommandAndCapture(
  identifier: string,
  command: string,
  windowMs = 2500,
): Promise<string[]> {
  const { token, socket } = await getWebsocketCredentials(identifier);
  const lines: string[] = [];

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(socket, { headers: { Origin: process.env.PTERODACTYL_URL } });
    let timer: ReturnType<typeof setTimeout> | null = null;

    ws.on("open", () => {
      ws.send(JSON.stringify({ event: "auth", args: [token] }));
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { event: string; args?: string[] };
        if (msg.event === "auth success") {
          ws.send(JSON.stringify({ event: "send command", args: [command] }));
          timer = setTimeout(() => ws.close(), windowMs);
        }
        if (msg.event === "console output" && msg.args?.[0]) {
          lines.push(msg.args[0]);
        }
      } catch {
        // 파싱 불가한 프레임은 무시
      }
    });

    ws.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });

    ws.on("close", () => {
      if (timer) clearTimeout(timer);
      resolve(lines.slice(-200));
    });
  });
}
