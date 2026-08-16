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

export async function restoreBackup(
  identifier: string,
  backupUuid: string,
): Promise<void> {
  await clientRequest(
    `/api/client/servers/${identifier}/backups/${backupUuid}/restore`,
    { method: "POST", body: JSON.stringify({ truncate: true }) },
  );
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
    const ws = new WebSocket(socket);
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
