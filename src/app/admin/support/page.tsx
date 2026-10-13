"use client";

import { useEffect, useRef, useState } from "react";

interface ThreadSummary {
  id: string;
  status: "OPEN" | "CLOSED";
  updatedAt: string;
  user: { id: string; name: string; email: string };
  lastMessage: { content: string; senderRole: "USER" | "ADMIN"; createdAt: string } | null;
}
interface Message {
  id: string;
  senderRole: "USER" | "ADMIN";
  content: string;
  createdAt: string;
}
interface ThreadDetail {
  id: string;
  status: "OPEN" | "CLOSED";
  user: { id: string; name: string; email: string };
  messages: Message[];
}

export default function AdminSupportPage() {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  function loadList() {
    fetch("/api/admin/support")
      .then((r) => r.json())
      .then(setThreads)
      .catch(() => {});
  }

  function loadDetail(id: string) {
    fetch(`/api/admin/support/${id}`)
      .then((r) => r.json())
      .then(setDetail)
      .catch(() => {});
  }

  useEffect(() => {
    loadList();
    const timer = setInterval(loadList, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    loadDetail(selectedId);
    const timer = setInterval(() => loadDetail(selectedId), 6000);
    return () => clearInterval(timer);
  }, [selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages.length]);

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim() || !selectedId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/support/${selectedId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply }),
      });
      if (res.ok) {
        setDetail(await res.json());
        setReply("");
        loadList();
      }
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: "OPEN" | "CLOSED") {
    if (!selectedId) return;
    await fetch(`/api/admin/support/${selectedId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadDetail(selectedId);
    loadList();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">고객지원</h1>
      <p className="text-sm text-text-dim mt-1">대시보드에서 들어온 1:1 문의예요.</p>

      <div className="mt-6 grid md:grid-cols-[280px_1fr] gap-4">
        <div className="space-y-1.5">
          {threads.length === 0 && <p className="text-sm text-text-dim">아직 문의가 없어요.</p>}
          {threads.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className={`w-full text-left card-glow p-3 text-sm ${selectedId === t.id ? "border-accent" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{t.user.name}</span>
                {t.status === "CLOSED" && <span className="text-xs text-text-dim shrink-0">종료</span>}
              </div>
              <p className="text-xs text-text-dim truncate mt-0.5">
                {t.lastMessage ? `${t.lastMessage.senderRole === "ADMIN" ? "나: " : ""}${t.lastMessage.content}` : "(메시지 없음)"}
              </p>
            </button>
          ))}
        </div>

        <div className="card-glow p-4 flex flex-col min-h-[400px]">
          {!detail ? (
            <p className="text-sm text-text-dim m-auto">왼쪽에서 문의를 선택해주세요.</p>
          ) : (
            <>
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div>
                  <p className="font-medium text-sm">{detail.user.name}</p>
                  <p className="text-xs text-text-dim">{detail.user.email}</p>
                </div>
                <button
                  onClick={() => setStatus(detail.status === "OPEN" ? "CLOSED" : "OPEN")}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  {detail.status === "OPEN" ? "문의 종료" : "다시 열기"}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 py-3">
                {detail.messages.map((m) => (
                  <div key={m.id} className={`flex ${m.senderRole === "ADMIN" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                        m.senderRole === "ADMIN" ? "bg-accent text-white" : "bg-surface-2 text-text"
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={sendReply} className="flex gap-2 pt-2 border-t border-border">
                <input
                  className="input flex-1 text-sm"
                  placeholder="답장 입력..."
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                />
                <button type="submit" disabled={busy || !reply.trim()} className="btn-primary px-4 py-2 text-sm disabled:opacity-40">
                  보내기
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
