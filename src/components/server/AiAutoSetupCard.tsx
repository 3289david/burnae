"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Sparkles } from "lucide-react";

/** GitHub 등에서 저장소를 가져와 만들어진 서버에 한 번 제공되는 "AI 자동 설치/설정" 제안.
 * 비용은 고객 크레딧이 아니라 플랫폼이 부담 — 그래서 꼭 소유자 동의를 받고 시작한다. */
export default function AiAutoSetupCard({ serverId }: { serverId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/ai-auto-setup`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/dashboard/servers/${serverId}?tab=ai`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "시작하지 못했어요.");
      setBusy(false);
    }
  }

  if (dismissed) return null;

  return (
    <div className="card-glow p-5 space-y-3 border-accent/30">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
          <Sparkles size={15} className="text-accent" />
        </span>
        <div className="flex-1">
          <h3 className="font-semibold text-sm">AI가 자동으로 설치/설정해드릴까요?</h3>
          <p className="text-xs text-text-dim">
            방금 가져온 저장소를 AI가 살펴보고 필요한 패키지 설치, 설정을 자동으로 해드려요. 비용은 저희가 부담해요(내 AI 크레딧 안 써요).
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={start} disabled={busy} className="btn-primary px-3.5 py-2 text-xs">
          {busy ? "시작하는 중..." : "AI 자동 설정 시작하기"}
        </button>
        <button onClick={() => setDismissed(true)} disabled={busy} className="btn-secondary px-3.5 py-2 text-xs">
          괜찮아요
        </button>
      </div>
      {error && <p className="text-xs text-red">{error}</p>}
    </div>
  );
}
