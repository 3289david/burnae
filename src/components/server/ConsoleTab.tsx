"use client";

import { useEffect, useRef, useState } from "react";
import {
  Download, Trash2, Copy, Check, Maximize2, Minimize2, ArrowDownToLine,
  Play, RotateCw, Square, Power, Lock,
} from "lucide-react";
import { hasServerRank, type ServerAccessRole } from "@/lib/serverRoleRank";

interface WsFrame {
  event: string;
  args?: string[];
}

const MINECRAFT_QUICK_COMMANDS = [
  { label: "전체 저장", command: "save-all" },
  { label: "화이트리스트 목록", command: "whitelist list" },
  { label: "접속자 목록", command: "list" },
  { label: "낮으로", command: "time set day" },
  { label: "날씨 맑게", command: "weather clear" },
];

// 스크롤이 이 정도(px) 안쪽에 있으면 "맨 아래"로 취급한다 — 줄바꿈 애니메이션 때문에 생기는
// 1~2px 오차로 자동 스크롤이 계속 꺼졌다 켜졌다 하는 걸 막기 위한 여유값
const BOTTOM_THRESHOLD = 24;

export default function ConsoleTab({
  serverId,
  templateCategory,
  myRole,
}: {
  serverId: string;
  templateCategory?: "MINECRAFT" | "DISCORD_BOT" | "GENERAL";
  myRole: ServerAccessRole | null;
}) {
  // 콘솔 웹소켓 토큰은 Wings 쪽에서 보기/명령 실행 권한이 분리가 안 돼서(발급하면 명령까지
  // 그대로 보낼 수 있음) 서버(/api/servers/[id]/websocket)도 DEVELOPER 이상만 토큰을 내준다 —
  // 뷰어/모더레이터에게 연결을 시도조차 안 하고 바로 권한 안내만 보여준다.
  const canUseConsole = hasServerRank(myRole, "DEVELOPER");
  const canPower = hasServerRank(myRole, "MODERATOR");
  const [lines, setLines] = useState<string[]>([]);
  const [command, setCommand] = useState("");
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [powerBusy, setPowerBusy] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number | null>(null);
  const draftRef = useRef("");

  useEffect(() => {
    if (!canUseConsole) return;
    let closedByUs = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    // 소켓이 끊겼을 때(네트워크 순단, 노드 쪽 일시적 연결 끊김 등) 그냥 "연결 중..."에 멈춰있지
    // 않고 점점 늘어나는 간격(1s→2s→4s→8s, 최대 10s)으로 스스로 다시 붙는다.
    function scheduleReconnect() {
      if (closedByUs) return;
      attempt += 1;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 10000);
      reconnectTimer = setTimeout(connect, delay);
    }

    async function connect() {
      try {
        const res = await fetch(`/api/servers/${serverId}/websocket`);
        if (!res.ok) throw new Error("websocket 자격 증명 발급 실패");
        const { token, socket } = await res.json();
        if (closedByUs) return;

        ws = new WebSocket(socket);
        wsRef.current = ws;

        ws.onopen = () => {
          attempt = 0;
          ws?.send(JSON.stringify({ event: "auth", args: [token] }));
        };

        ws.onmessage = (evt) => {
          const frame: WsFrame = JSON.parse(evt.data);
          if (frame.event === "auth success") {
            setConnected(true);
            // 접속하자마자 지금까지의 콘솔 출력(백로그)도 요청해서 이어서 보여준다
            ws?.send(JSON.stringify({ event: "send logs", args: [null] }));
          }
          if (frame.event === "console output" && frame.args?.[0]) {
            setLines((prev) => [...prev.slice(-500), frame.args![0]]);
          }
          if (frame.event === "token expiring") {
            fetch(`/api/servers/${serverId}/websocket`)
              .then((r) => r.json())
              .then((d) => ws?.send(JSON.stringify({ event: "auth", args: [d.token] })));
          }
        };

        ws.onclose = () => {
          setConnected(false);
          scheduleReconnect();
        };
        ws.onerror = () => ws?.close();
      } catch {
        setConnected(false);
        scheduleReconnect();
      }
    }

    connect();
    return () => {
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [serverId]);

  useEffect(() => {
    if (!autoScroll) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines, autoScroll]);

  // 사용자가 과거 로그를 보려고 위로 스크롤하면 자동 스크롤을 잠깐 멈추고,
  // 다시 맨 아래로 내리면 자동 스크롤을 되살린다.
  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
    setAutoScroll(atBottom);
  }

  function jumpToBottom() {
    setAutoScroll(true);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }

  function runQuickCommand(cmd: string) {
    wsRef.current?.send(JSON.stringify({ event: "send command", args: [cmd] }));
  }

  function sendCommand(e: React.FormEvent) {
    e.preventDefault();
    if (!command.trim()) return;
    runQuickCommand(command);
    historyRef.current = [...historyRef.current.slice(-100), command];
    historyIndexRef.current = null;
    draftRef.current = "";
    setCommand("");
  }

  // 터미널처럼 ↑/↓로 이전에 보낸 명령을 다시 불러온다
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const history = historyRef.current;
    if (history.length === 0) return;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (historyIndexRef.current === null) {
        draftRef.current = command;
        historyIndexRef.current = history.length - 1;
      } else if (historyIndexRef.current > 0) {
        historyIndexRef.current -= 1;
      }
      setCommand(history[historyIndexRef.current]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndexRef.current === null) return;
      if (historyIndexRef.current < history.length - 1) {
        historyIndexRef.current += 1;
        setCommand(history[historyIndexRef.current]);
      } else {
        historyIndexRef.current = null;
        setCommand(draftRef.current);
      }
    }
  }

  function clearConsole() {
    setLines([]);
  }

  function copyOutput() {
    const text = lines.map(stripAnsi).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function downloadLog() {
    const text = lines.map(stripAnsi).join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `console-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function power(signal: "start" | "stop" | "restart" | "kill") {
    if (signal === "kill" && !confirm("프로세스를 강제 종료할까요? 저장되지 않은 데이터는 사라질 수 있어요.")) return;
    setPowerBusy(true);
    try {
      await fetch(`/api/servers/${serverId}/power`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signal }),
      });
    } finally {
      setPowerBusy(false);
    }
  }

  if (!canUseConsole) {
    return (
      <div className="card p-8 flex flex-col items-center justify-center gap-2 text-center">
        <Lock size={22} className="text-text-dim" />
        <p className="font-medium">콘솔을 볼 권한이 없어요</p>
        <p className="text-sm text-text-dim">초대받은 역할이 콘솔 접근을 포함하지 않아요. 서버 소유자에게 문의해주세요.</p>
      </div>
    );
  }

  return (
    <div className={fullscreen ? "fixed inset-2 z-50 card p-0 overflow-hidden flex flex-col" : "card p-0 overflow-hidden"}>
      <div className="px-4 py-2 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm text-text-dim inline-flex items-center gap-1.5">
          <span className="relative inline-flex w-2 h-2">
            {connected && <span className="absolute inset-0 rounded-full bg-green animate-ping" />}
            <span className={`relative w-2 h-2 rounded-full ${connected ? "bg-green" : "bg-yellow"}`} />
          </span>
          콘솔 {connected ? "· 연결됨" : "· 연결 중..."}
        </span>

        <div className="flex items-center gap-1">
          {canPower && (
            <>
              <button
                onClick={() => power("start")}
                disabled={powerBusy}
                title="시작"
                className="p-1.5 rounded-lg text-green hover:bg-green/15 disabled:opacity-40 active:scale-95 transition-transform"
              >
                <Play size={14} />
              </button>
              <button
                onClick={() => power("restart")}
                disabled={powerBusy}
                title="재시작"
                className="p-1.5 rounded-lg text-yellow hover:bg-yellow/15 disabled:opacity-40 active:scale-95 transition-transform"
              >
                <RotateCw size={14} className={powerBusy ? "animate-spin" : ""} />
              </button>
              <button
                onClick={() => power("stop")}
                disabled={powerBusy}
                title="정지"
                className="p-1.5 rounded-lg text-red hover:bg-red/15 disabled:opacity-40 active:scale-95 transition-transform"
              >
                <Square size={14} />
              </button>
              <button
                onClick={() => power("kill")}
                disabled={powerBusy}
                title="강제 종료"
                className="p-1.5 rounded-lg text-red hover:bg-red/15 disabled:opacity-40 active:scale-95 transition-transform"
              >
                <Power size={14} />
              </button>
              <span className="w-px h-4 bg-border mx-1" />
            </>
          )}

          <button onClick={copyOutput} disabled={lines.length === 0} title="출력 복사" className="p-1.5 rounded-lg text-text-dim hover:text-text hover:bg-white/5 disabled:opacity-40 active:scale-95 transition-transform">
            {copied ? <Check size={14} className="text-green" /> : <Copy size={14} />}
          </button>
          <button onClick={downloadLog} disabled={lines.length === 0} title="로그 다운로드" className="p-1.5 rounded-lg text-text-dim hover:text-text hover:bg-white/5 disabled:opacity-40 active:scale-95 transition-transform">
            <Download size={14} />
          </button>
          <button onClick={clearConsole} disabled={lines.length === 0} title="화면 지우기" className="p-1.5 rounded-lg text-text-dim hover:text-text hover:bg-white/5 disabled:opacity-40 active:scale-95 transition-transform">
            <Trash2 size={14} />
          </button>
          <button onClick={() => setFullscreen((f) => !f)} title={fullscreen ? "전체화면 종료" : "전체화면"} className="p-1.5 rounded-lg text-text-dim hover:text-text hover:bg-white/5 active:scale-95 transition-transform">
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>
      {templateCategory === "MINECRAFT" && (
        <div className="px-4 py-2 border-b border-border flex flex-wrap gap-1.5">
          {MINECRAFT_QUICK_COMMANDS.map((qc, i) => (
            <button
              key={qc.command}
              onClick={() => runQuickCommand(qc.command)}
              disabled={!connected}
              className="btn-secondary px-2.5 py-1 text-xs disabled:opacity-40 active:scale-95 transition-transform animate-fade-up"
              style={{ animationDelay: `${i * 0.03}s` }}
            >
              {qc.label}
            </button>
          ))}
        </div>
      )}
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className={`${fullscreen ? "h-full" : "h-96"} overflow-y-auto bg-black/30 px-4 py-3 font-mono text-xs leading-relaxed`}
        >
          {lines.length === 0 && <p className="text-text-dim">출력을 기다리는 중...</p>}
          {lines.map((line, i) => (
            <div
              key={i}
              className={`whitespace-pre-wrap break-all ${i === lines.length - 1 ? "animate-toast-in" : ""}`}
            >
              {renderAnsiLine(line)}
            </div>
          ))}
        </div>
        {!autoScroll && (
          <button
            onClick={jumpToBottom}
            className="absolute bottom-3 right-3 btn-secondary px-2.5 py-1.5 text-xs inline-flex items-center gap-1 shadow-lg active:scale-95 transition-transform"
          >
            <ArrowDownToLine size={12} /> 맨 아래로
          </button>
        )}
      </div>
      <form onSubmit={sendCommand} className="flex border-t border-border">
        <span className="px-3 flex items-center text-text-dim">{">"}</span>
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="명령어 입력 (예: say 안녕하세요, ↑/↓로 이전 명령 다시 불러오기)"
          className="flex-1 bg-transparent px-2 py-3 text-sm outline-none"
        />
        <button type="submit" className="px-4 text-accent font-medium active:scale-95 transition-transform">실행</button>
      </form>
    </div>
  );
}

function stripAnsi(s: string) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

const BASE16_COLORS = [
  "#5c6370", "#e06c75", "#98c379", "#e5c07b", "#61afef", "#c678dd", "#56b6c2", "#abb2bf",
  "#7f848e", "#f0717c", "#b2e07d", "#f0cf8e", "#7fc1ff", "#d9a3ef", "#7fd4de", "#e6e6ea",
];

function xterm256(n: number): string {
  if (n < 16) return BASE16_COLORS[n];
  if (n <= 231) {
    const steps = [0, 95, 135, 175, 215, 255];
    const idx = n - 16;
    const r = steps[Math.floor(idx / 36) % 6];
    const g = steps[Math.floor(idx / 6) % 6];
    const b = steps[idx % 6];
    return `rgb(${r},${g},${b})`;
  }
  const v = 8 + (n - 232) * 10;
  return `rgb(${v},${v},${v})`;
}

interface AnsiStyle {
  color?: string;
  fontWeight?: "bold";
  fontStyle?: "italic";
  textDecoration?: "underline";
  opacity?: number;
}

/** Wings/마인크래프트 콘솔이 보내는 ANSI SGR 색상 코드를 실제 터미널처럼 색을 입혀서 렌더링한다 */
function renderAnsiLine(line: string): React.ReactNode {
  const parts: { text: string; style: AnsiStyle }[] = [];
  let style: AnsiStyle = {};
  let lastIndex = 0;
  const regex = /\x1b\[([0-9;]*)m/g;
  let match: RegExpExecArray | null;

  const applyCodes = (codes: number[]) => {
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      if (code === 0) style = {};
      else if (code === 1) style = { ...style, fontWeight: "bold" };
      else if (code === 2) style = { ...style, opacity: 0.6 };
      else if (code === 3) style = { ...style, fontStyle: "italic" };
      else if (code === 4) style = { ...style, textDecoration: "underline" };
      else if (code === 22) { const { fontWeight, opacity, ...rest } = style; style = rest; }
      else if (code === 23) { const { fontStyle, ...rest } = style; style = rest; }
      else if (code === 24) { const { textDecoration, ...rest } = style; style = rest; }
      else if (code >= 30 && code <= 37) style = { ...style, color: BASE16_COLORS[code - 30] };
      else if (code >= 90 && code <= 97) style = { ...style, color: BASE16_COLORS[code - 90 + 8] };
      else if (code === 39) { const { color, ...rest } = style; style = rest; }
      else if (code === 38 && codes[i + 1] === 5) { style = { ...style, color: xterm256(codes[i + 2]) }; i += 2; }
      else if (code === 38 && codes[i + 1] === 2) { style = { ...style, color: `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})` }; i += 4; }
    }
  };

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) parts.push({ text: line.slice(lastIndex, match.index), style });
    const codes = match[1].length ? match[1].split(";").map(Number) : [0];
    applyCodes(codes);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < line.length) parts.push({ text: line.slice(lastIndex), style });

  return parts.map((p, i) => (
    <span key={i} style={p.style}>{p.text}</span>
  ));
}
