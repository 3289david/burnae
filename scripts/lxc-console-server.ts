import "dotenv/config";
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { verifyLxcConsoleToken } from "../src/lib/lxcConsoleToken";
import { spawnVpsConsoleShell } from "../src/lib/vpsLxc";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

/**
 * LXC VPS 콘솔용 독립 웹소켓 서버 — burnae-web(Next.js) 프로세스와 분리된 전용 데몬이다
 * (ssh-gateway와 같은 이유: 장시간 유지되는 양방향 스트림은 Next.js의 요청/응답 모델에
 * 맞지 않고, next start가 ws upgrade 훅을 노출하지 않는다). nginx가
 * wss://burnae.kr/_internal/lxc-console 를 이 프로세스(127.0.0.1:LXC_CONSOLE_PORT)로
 * 그대로 넘겨준다 — 이 프로세스는 외부에 직접 노출되지 않는다.
 *
 * 프론트(ConsoleTab.tsx)는 이미 Wings의 콘솔 프레임 프로토콜({event, args[]})을 그대로 쓰고
 * 있어서, 여기서도 똑같은 이벤트 이름(auth/auth success/console output/send command/
 * send logs/token expiring)을 흉내내면 프론트 코드를 한 줄도 안 건드려도 된다.
 */
const PORT = Number(process.env.LXC_CONSOLE_PORT || 8097);
const AUTH_TIMEOUT_MS = 8_000;
const BACKLOG_MAX_LINES = 300;
const TOKEN_REFRESH_WARNING_MS = 15_000;

interface Session {
  ws: WebSocket;
  child: ChildProcessWithoutNullStreams | null;
  backlog: string[];
  partial: string;
  flushTimer: ReturnType<typeof setTimeout> | null;
  expireWarnTimer: ReturnType<typeof setTimeout> | null;
  authTimeout: ReturnType<typeof setTimeout> | null;
}

function send(ws: WebSocket, event: string, args?: unknown[]) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ event, args }));
}

function pushLine(session: Session, rawLine: string) {
  const line = rawLine.replace(/\r+$/, "");
  session.backlog.push(line);
  if (session.backlog.length > BACKLOG_MAX_LINES) session.backlog.shift();
  send(session.ws, "console output", [line]);
}

function feedOutput(session: Session, chunk: string) {
  session.partial += chunk;
  const lines = session.partial.split(/\r?\n/);
  session.partial = lines.pop() ?? "";
  for (const line of lines) pushLine(session, line);

  if (session.flushTimer) clearTimeout(session.flushTimer);
  if (session.partial) {
    // 줄바꿈 없이 끝나는 프롬프트(예: "root@vps-xxx:/# ")도 잠깐 기다렸다가 화면에 보여준다.
    session.flushTimer = setTimeout(() => {
      if (session.partial) {
        pushLine(session, session.partial);
        session.partial = "";
      }
    }, 120);
  }
}

function startShell(session: Session, containerName: string) {
  const child = spawnVpsConsoleShell(containerName);
  session.child = child;
  child.stdout.on("data", (d: Buffer) => feedOutput(session, d.toString()));
  child.stderr.on("data", (d: Buffer) => feedOutput(session, d.toString()));
  child.on("exit", () => {
    pushLine(session, "[컨테이너 셸 연결이 종료되었습니다]");
    session.child = null;
  });
  child.on("error", (err) => {
    pushLine(session, `[셸을 시작할 수 없습니다: ${err.message}]`);
  });
}

function scheduleExpireWarning(session: Session, expMs: number) {
  if (session.expireWarnTimer) clearTimeout(session.expireWarnTimer);
  const delay = Math.max(0, expMs - Date.now() - TOKEN_REFRESH_WARNING_MS);
  session.expireWarnTimer = setTimeout(() => send(session.ws, "token expiring"), delay);
}

function cleanupSession(session: Session) {
  if (session.authTimeout) clearTimeout(session.authTimeout);
  if (session.flushTimer) clearTimeout(session.flushTimer);
  if (session.expireWarnTimer) clearTimeout(session.expireWarnTimer);
  session.child?.kill();
}

const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer, path: "/_internal/lxc-console" });

wss.on("connection", (ws) => {
  const session: Session = { ws, child: null, backlog: [], partial: "", flushTimer: null, expireWarnTimer: null, authTimeout: null };
  let authed = false;

  session.authTimeout = setTimeout(() => {
    if (!authed) ws.close(4001, "auth timeout");
  }, AUTH_TIMEOUT_MS);

  ws.on("message", async (raw) => {
    let frame: { event?: string; args?: unknown[] };
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (frame.event === "auth") {
      const token = String(frame.args?.[0] ?? "");
      try {
        const { containerName, expMs } = await verifyLxcConsoleTokenWithExp(token);
        authed = true;
        if (session.authTimeout) clearTimeout(session.authTimeout);
        scheduleExpireWarning(session, expMs);
        send(ws, "auth success");
        if (!session.child) startShell(session, containerName);
      } catch {
        ws.close(4003, "invalid token");
      }
      return;
    }

    if (!authed) return;

    if (frame.event === "send command") {
      const command = String(frame.args?.[0] ?? "");
      if (command && session.child) session.child.stdin.write(`${command}\n`);
      return;
    }

    if (frame.event === "send logs") {
      for (const line of session.backlog) send(ws, "console output", [line]);
      return;
    }
  });

  ws.on("close", () => cleanupSession(session));
  ws.on("error", () => cleanupSession(session));
});

async function verifyLxcConsoleTokenWithExp(token: string): Promise<{ containerName: string; expMs: number }> {
  const { containerName } = await verifyLxcConsoleToken(token);
  // signLxcConsoleToken의 TTL(90s)과 동일하게 맞춰서 만료 15초 전에 경고를 보낸다 — jose는
  // payload의 exp를 검증만 하고 우리에게 되돌려주지 않으므로, 서명 시점 기준 TTL을 그대로 가정한다.
  return { containerName, expMs: Date.now() + 90_000 };
}

httpServer.listen(PORT, "127.0.0.1", () => {
  console.log(`[lxc-console] listening on 127.0.0.1:${PORT}`);
});
