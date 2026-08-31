"use client";

import { useState } from "react";
import SuccessCheck from "@/components/SuccessCheck";

export default function DepositorNameCard({ initial }: { initial: string | null }) {
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/account/depositor-name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositorName: value.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card-glow p-5 animate-fade-up">
      <h3 className="font-semibold">결제 입금자명</h3>
      <p className="text-sm text-text-dim mt-1">
        무통장입금 시 사용할 입금자명이에요. 공백 없이 1~5자여야 하고, 비워두면 이름 기반으로 자동
        생성돼요.
      </p>
      <form onSubmit={save} className="flex gap-2 mt-3">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value.replace(/\s+/g, ""));
            setSaved(false);
          }}
          maxLength={5}
          placeholder="예: 홍길동"
          className="input flex-1 text-sm"
        />
        <button type="submit" disabled={saving} className="btn-secondary px-4 py-1.5 text-sm shrink-0 active:scale-95 transition-transform">
          {saving ? "저장 중..." : "저장"}
        </button>
      </form>
      {saved && (
        <p className="animate-toast-in text-xs text-green mt-2 flex items-center gap-1">
          <SuccessCheck size={16} /> 저장됐어요.
        </p>
      )}
      {error && <p className="text-xs text-red mt-2">{error}</p>}
    </div>
  );
}
