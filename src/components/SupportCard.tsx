"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";

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

const POLL_MS = 8000;

export default function SupportCard() {
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  function load() {
    fetch("/api/support")
      .then((r) => (r.ok ? r.json() : null))
      .then(setThread)
      .catch(() => {});
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [open]);

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
    <div className="card-glow p-5 space-y-3 animate-fade-up">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between">
        <span className="font-semibold text-sm flex items-center gap-1.5">
          <MessageCircle size={16} className="text-accent" /> 고객지원
        </span>
        <span className="text-xs text-text-dim">{open ? "접기" : "문의하기"}</span>
      </button>

      {!open && (
        <p className="text-xs text-text-dim">
          궁금한 점을 적으면 관리자가 여기서 바로 답장해줘요. 급하면 문자 상담 070-8970-6766로도 연락할 수 있어요.
        </p>
      )}

      {open && (
        <>
          <div className="max-h-72 overflow-y-auto space-y-2 border border-border rounded-lg p-3">
            {(thread?.messages.length ?? 0) === 0 && (
              <p className="text-xs text-text-dim text-center py-4">아직 대화가 없어요. 아래에 메시지를 보내보세요.</p>
            )}
            {thread?.messages.map((m) => (
              <div key={m.id} className={`flex ${m.senderRole === "USER" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-xl px-3 py-2 text-xs whitespace-pre-wrap break-words ${
                    m.senderRole === "USER" ? "bg-accent text-white" : "bg-surface-2 text-text"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={submit} className="flex gap-2">
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
          {error && <p className="text-xs text-red">{error}</p>}
        </>
      )}
    </div>
  );
}
