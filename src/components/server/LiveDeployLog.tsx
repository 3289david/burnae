"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal, X } from "lucide-react";

interface WsFrame {
  event: string;
  args?: string[];
}

function stripAnsi(s: string) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * GitDeployCard용 "실시간 배포 로그" 패널. git pull/빌드 명령은 서버 쪽에서 여전히
 * Wings 콘솔 웹소켓으로 전송되므로(runCommandAndCapture), 이 컴포넌트는 ConsoleTab과
 * 똑같은 방식으로 그 콘솔에 읽기 전용으로 접속해서 같은 출력을 실시간으로 보여주기만
 * 한다 — 서버 쪽 배포 로직은 전혀 건드리지 않고, 10~30초 기다렸다 한 번에 보여주던 걸
 * 실시간 스트리밍으로 바꾸는 것만으로 충분하다. 웹훅으로 트리거된 배포도 이 패널을 열어
 * 두면 그대로 보인다.
 */
export default function LiveDeployLog({ serverId, active, onClose }: { serverId: string; active: boolean; onClose: () => void }) {
  const [lines, setLines] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    let closedByUs = false;
    let ws: WebSocket | null = null;

    async function connect() {
      try {
        const res = await fetch(`/api/servers/${serverId}/websocket`);
        if (!res.ok) return;
        const { token, socket } = await res.json();
        if (closedByUs) return;

        ws = new WebSocket(socket);
        ws.onopen = () => ws?.send(JSON.stringify({ event: "auth", args: [token] }));
        ws.onmessage = (evt) => {
          const frame: WsFrame = JSON.parse(evt.data);
          if (frame.event === "auth success") {
            setConnected(true);
            ws?.send(JSON.stringify({ event: "send logs", args: [null] }));
          }
          if (frame.event === "console output" && frame.args?.[0]) {
            const line = stripAnsi(frame.args[0]);
            // deploy.ts가 명령 완료 감지용으로 붙이는 echo 마커 — 사람이 보는 로그엔 안 보여준다
            if (line.includes("__BURNAE_DONE_")) return;
            setLines((prev) => [...prev.slice(-300), line]);
          }
          if (frame.event === "token expiring") {
            fetch(`/api/servers/${serverId}/websocket`)
              .then((r) => r.json())
              .then((d) => ws?.send(JSON.stringify({ event: "auth", args: [d.token] })));
          }
        };
        ws.onclose = () => setConnected(false);
      } catch {
        setConnected(false);
      }
    }

    connect();
    return () => {
      closedByUs = true;
      ws?.close();
    };
  }, [serverId, active]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  if (!active) return null;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="px-3 py-1.5 border-b border-border flex items-center justify-between bg-surface-2/50">
        <span className="text-xs text-text-dim inline-flex items-center gap-1.5">
          <Terminal size={12} />
          실시간 배포 로그
          <span className="relative inline-flex w-1.5 h-1.5 ml-1">
            {connected && <span className="absolute inset-0 rounded-full bg-green animate-ping" />}
            <span className={`relative w-1.5 h-1.5 rounded-full ${connected ? "bg-green" : "bg-yellow"}`} />
          </span>
        </span>
        <button onClick={onClose} className="text-text-dim hover:text-text p-0.5">
          <X size={13} />
        </button>
      </div>
      <div ref={scrollRef} className="h-48 overflow-y-auto bg-black/30 px-3 py-2 font-mono text-[11px] leading-relaxed">
        {lines.length === 0 && <p className="text-text-dim">출력을 기다리는 중...</p>}
        {lines.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
        ))}
      </div>
    </div>
  );
}
