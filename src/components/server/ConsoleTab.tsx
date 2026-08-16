"use client";

import { useEffect, useRef, useState } from "react";

interface WsFrame {
  event: string;
  args?: string[];
}

export default function ConsoleTab({ serverId }: { serverId: string }) {
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
        if (frame.event === "auth success") setConnected(true);
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

  function sendCommand(e: React.FormEvent) {
    e.preventDefault();
    if (!command.trim()) return;
    wsRef.current?.send(JSON.stringify({ event: "send command", args: [command] }));
    setCommand("");
  }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-4 py-2 border-b border-border flex items-center justify-between">
        <span className="text-sm text-text-dim">콘솔 {connected ? "· 연결됨" : "· 연결 중..."}</span>
      </div>
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
