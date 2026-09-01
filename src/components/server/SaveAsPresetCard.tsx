"use client";

import { useState } from "react";
import { BookmarkPlus } from "lucide-react";
import SuccessCheck from "@/components/SuccessCheck";

export default function SaveAsPresetCard({ serverId }: { serverId: string }) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [blurb, setBlurb] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/save-as-preset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, blurb: blurb || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "저장에 실패했어요.");
        return;
      }
      setDone(data.pointsAwarded ?? 0);
    } finally {
      setBusy(false);
    }
  }

  if (done !== null) {
    return (
      <div className="card-glow p-5 flex items-center gap-3 animate-fade-up">
        <SuccessCheck size={28} confetti className="shrink-0" />
        <p className="text-sm text-green">
          커뮤니티 프리셋으로 저장했어요{done > 0 ? ` (포인트 ${done}P 적립)` : ""}! 서버 만들기에서 바로 골라 쓸 수 있어요.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="card-glow p-5 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-sm">이 서버 설정을 프리셋으로 저장</h3>
          <p className="text-xs text-text-dim mt-0.5">지금 이 서버가 쓰는 시작 변수 값 그대로 커뮤니티 프리셋으로 공개해요.</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn-secondary px-4 py-2 text-sm inline-flex items-center gap-1.5 shrink-0 active:scale-95 transition-transform">
          <BookmarkPlus size={14} /> 프리셋으로 저장
        </button>
      </div>
    );
  }

  return (
    <div className="card-glow p-5 space-y-3 animate-fade-up">
      <h3 className="font-semibold text-sm">이 서버 설정을 프리셋으로 저장</h3>
      <input
        className="input w-full text-sm"
        placeholder="프리셋 이름 (예: 내 서버 설정)"
        maxLength={40}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />
      <input
        className="input w-full text-sm"
        placeholder="한 줄 설명 (선택)"
        maxLength={200}
        value={blurb}
        onChange={(e) => setBlurb(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={busy || displayName.trim().length < 1}
          className="btn-primary px-3.5 py-1.5 text-xs active:scale-95 transition-transform"
        >
          {busy ? "저장하는 중..." : "저장하기"}
        </button>
        <button onClick={() => setOpen(false)} className="btn-secondary px-3.5 py-1.5 text-xs active:scale-95 transition-transform">
          취소
        </button>
      </div>
      {error && <p className="text-xs text-red">{error}</p>}
    </div>
  );
}
