"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";

export default function SupportCard({ discordLinked }: { discordLinked: boolean }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
      setSent(true);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "전송 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-glow p-5 space-y-2 animate-fade-up">
      <p className="font-semibold text-sm flex items-center gap-1.5">
        <MessageCircle size={16} className="text-accent" /> 고객지원
      </p>

      {!discordLinked ? (
        <p className="text-xs text-text-dim">
          관리자와 1:1로 대화하려면 먼저 디스코드 연동이 필요해요 — 위 디스코드 연동 카드에서 진행해주세요.
        </p>
      ) : sent ? (
        <p className="text-xs text-green">✅ 보냈어요! 디스코드에 비공개 채널이 열렸어요 — 거기서 이어서 대화해주세요.</p>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          <p className="text-xs text-text-dim">궁금한 점을 적어서 보내면 관리자와 1:1로 대화할 수 있는 디스코드 비공개 채널이 열려요.</p>
          <textarea
            className="input w-full text-sm min-h-20"
            placeholder="문의 내용을 입력해주세요"
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={busy || !message.trim()}
            className="btn-primary px-3.5 py-1.5 text-sm active:scale-95 transition-transform disabled:opacity-40"
          >
            {busy ? "보내는 중..." : "관리자에게 보내기"}
          </button>
          {error && <p className="text-xs text-red">{error}</p>}
        </form>
      )}
    </div>
  );
}
