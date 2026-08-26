"use client";

import { useEffect, useState } from "react";

interface SurveyResponse {
  id: string;
  discordTag: string | null;
  content: string;
  reviewed: boolean;
  createdAt: string;
  user: { name: string; email: string } | null;
}

export default function AdminSurveysPage() {
  const [items, setItems] = useState<SurveyResponse[]>([]);

  async function load() {
    const res = await fetch("/api/admin/surveys");
    if (res.ok) setItems(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function toggleReviewed(id: string, reviewed: boolean) {
    await fetch(`/api/admin/surveys/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewed }),
    });
    await load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">설문/피드백</h1>
      <p className="text-sm text-text-dim mt-1">
        디스코드 <code>/설문</code> 명령어로 받은 자유 응답이에요.
      </p>

      <div className="mt-6 space-y-2">
        {items.map((r) => (
          <div key={r.id} className={`card p-4 ${r.reviewed ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm">{r.content}</p>
                <p className="text-xs text-text-dim mt-1">
                  {r.user ? `${r.user.name} (${r.user.email})` : r.discordTag ?? "익명"} ·{" "}
                  {new Date(r.createdAt).toLocaleString("ko-KR")}
                </p>
              </div>
              <button
                onClick={() => toggleReviewed(r.id, !r.reviewed)}
                className="btn-secondary px-3 py-1.5 text-xs shrink-0"
              >
                {r.reviewed ? "미확인으로" : "확인 완료"}
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-text-dim">아직 받은 응답이 없어요.</p>}
      </div>
    </div>
  );
}
