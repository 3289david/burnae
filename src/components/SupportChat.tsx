"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { DiscordLogo } from "@/components/ProviderIcons";

const DISCORD_INVITE_URL = process.env.NEXT_PUBLIC_DISCORD_SERVER_INVITE_URL;

interface SupportMessage {
  id: string;
  senderRole: "USER" | "ADMIN";
  content: string;
  createdAt: string;
}
interface SupportThread {
  id: string;
  status: "OPEN" | "CLOSED";
  messages: SupportMessage[];
}

const POLL_MS = 6000;

export default function SupportChat() {
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  function load() {
    fetch("/api/support")
      .then((r) => (r.ok ? r.json() : null))
      .then(setThread)
      .catch(() => {});
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages.length]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setThread(data);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "전송 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md">
      <div className="flex items-center gap-3 animate-fade-up">
        <span className="w-11 h-11 rounded-2xl bg-accent/15 flex items-center justify-center shrink-0">
          <MessageCircle size={20} className="text-accent" />
        </span>
        <h1 className="text-2xl font-bold font-display">고객지원</h1>
      </div>

      <div className="card-glow p-4 mt-5 text-xs text-text-dim space-y-0.5">
        <p>📱 문자 상담 070-8970-6766</p>
        <p>📠 팩스 0504-417-2275</p>
        {DISCORD_INVITE_URL && (
          <a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-text">
            <DiscordLogo size={12} /> 공식 디스코드 참여
          </a>
        )}
      </div>

      <div className="card-glow p-4 mt-4 flex flex-col">
        <div className="max-h-[50vh] min-h-48 overflow-y-auto space-y-2">
          {(thread?.messages.length ?? 0) === 0 && (
            <p className="text-xs text-text-dim text-center py-10">궁금한 점을 적어서 보내면 관리자가 답장해줘요.</p>
          )}
          {thread?.messages.map((m) => (
            <div key={m.id} className={`flex ${m.senderRole === "USER" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                  m.senderRole === "USER" ? "bg-accent text-white" : "bg-surface-2 text-text"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={submit} className="flex gap-2 pt-3 mt-2 border-t border-border">
          <input
            className="input flex-1 text-sm"
            placeholder="메시지를 입력해주세요"
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <button
            type="submit"
            disabled={busy || !message.trim()}
            className="btn-primary px-3.5 py-1.5 text-sm shrink-0 active:scale-95 transition-transform disabled:opacity-40"
          >
            전송
          </button>
        </form>
        {error && <p className="text-xs text-red mt-2">{error}</p>}
      </div>
    </div>
  );
}
