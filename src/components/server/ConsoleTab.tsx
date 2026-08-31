"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";

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

export default function ConsoleTab({
  serverId,
  templateCategory,
}: {
  serverId: string;
  templateCategory?: "MINECRAFT" | "DISCORD_BOT" | "GENERAL";
}) {
  const [lines, setLines] = useState<string[]>([]);
  const [command, setCommand] = useState("");
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let closedByUs = false;
    let ws: WebSocket | null = null;

    async function connect() {
      const res = await fetch(`/api/servers/${serverId}/websocket`);
      if (!res.ok) return;
      const { token, socket } = await res.json();
      if (closedByUs) return;

      ws = new WebSocket(socket);
      wsRef.current = ws;

      ws.onopen = () => ws?.send(JSON.stringify({ event: "auth", args: [token] }));

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

      ws.onclose = () => setConnected(false);
    }

    connect();
    return () => {
      closedByUs = true;
      ws?.close();
    };
  }, [serverId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  function runQuickCommand(cmd: string) {
    wsRef.current?.send(JSON.stringify({ event: "send command", args: [cmd] }));
  }

  function sendCommand(e: React.FormEvent) {
    e.preventDefault();
    if (!command.trim()) return;
    runQuickCommand(command);
    setCommand("");
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

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-4 py-2 border-b border-border flex items-center justify-between">
        <span className="text-sm text-text-dim">콘솔 {connected ? "· 연결됨" : "· 연결 중..."}</span>
        <button
          onClick={downloadLog}
          disabled={lines.length === 0}
          className="text-xs text-text-dim hover:text-text inline-flex items-center gap-1 disabled:opacity-40"
        >
          <Download size={13} /> 로그 다운로드
        </button>
      </div>
      {templateCategory === "MINECRAFT" && (
        <div className="px-4 py-2 border-b border-border flex flex-wrap gap-1.5">
          {MINECRAFT_QUICK_COMMANDS.map((qc) => (
            <button
              key={qc.command}
              onClick={() => runQuickCommand(qc.command)}
              disabled={!connected}
              className="btn-secondary px-2.5 py-1 text-xs disabled:opacity-40"
            >
              {qc.label}
            </button>
          ))}
        </div>
      )}
      <div ref={scrollRef} className="h-96 overflow-y-auto bg-black/30 px-4 py-3 font-mono text-xs leading-relaxed">
        {lines.length === 0 && <p className="text-text-dim">출력을 기다리는 중...</p>}
        {lines.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all">{stripAnsi(line)}</div>
        ))}
      </div>
      <form onSubmit={sendCommand} className="flex border-t border-border">
        <span className="px-3 flex items-center text-text-dim">{">"}</span>
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="명령어 입력 (예: say 안녕하세요)"
          className="flex-1 bg-transparent px-2 py-3 text-sm outline-none"
        />
        <button type="submit" className="px-4 text-accent font-medium">실행</button>
      </form>
    </div>
  );
}

function stripAnsi(s: string) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}
