"use client";

import { useEffect, useState } from "react";

interface Task {
  id: string;
  key: string;
  title: string;
  description: string;
  pointsAwarded: number;
  verifyMethod: string;
  active: boolean;
  completedCount: number;
}

interface Review {
  id: string;
  proofUrl: string | null;
  pointsAwarded: number;
  createdAt: string;
  user: { name: string; email: string };
  task: { title: string };
}

export default function AdminPromotionsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const [t, r] = await Promise.all([
      fetch("/api/admin/promotions").then((res) => res.json()),
      fetch("/api/admin/promotions/reviews").then((res) => res.json()),
    ]);
    setTasks(t);
    setReviews(r);
  }
  useEffect(() => { load(); }, []);

  async function toggleActive(id: string, active: boolean) {
    setBusy(id);
    await fetch(`/api/admin/promotions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    await load();
    setBusy(null);
  }

  async function updatePoints(id: string, pointsAwarded: number) {
    await fetch(`/api/admin/promotions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pointsAwarded }),
    });
    await load();
  }

  async function review(id: string, approve: boolean) {
    setBusy(id);
    await fetch(`/api/admin/promotions/reviews/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve }),
    });
    await load();
    setBusy(null);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">홍보 포인트</h1>
      <p className="text-sm text-text-dim mt-1">
        고객이 서버를 홍보하고 받을 수 있는 포인트 항목을 관리해요. 활성 항목만 고객 화면에 노출돼요.
      </p>

      {reviews.length > 0 && (
        <>
          <h2 className="font-semibold mt-6 mb-2">수동 승인 대기중 ({reviews.length})</h2>
          <div className="space-y-2">
            {reviews.map((r) => (
              <div key={r.id} className="card p-4 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.task.title} · {r.user.name} ({r.user.email})</p>
                  {r.proofUrl && (
                    <a href={r.proofUrl} target="_blank" rel="noreferrer" className="text-xs text-accent break-all">
                      {r.proofUrl}
                    </a>
                  )}
                  <p className="text-xs text-text-dim">+{r.pointsAwarded}P · {new Date(r.createdAt).toLocaleString("ko-KR")}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button disabled={busy === r.id} onClick={() => review(r.id, true)} className="btn-primary px-3 py-1.5 text-sm">승인</button>
                  <button disabled={busy === r.id} onClick={() => review(r.id, false)} className="btn-secondary px-3 py-1.5 text-sm">반려</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="font-semibold mt-6 mb-2">홍보 항목 ({tasks.length})</h2>
      <div className="space-y-2">
        {tasks.map((t) => (
          <div key={t.id} className="card p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t.title} {!t.active && <span className="text-text-dim text-xs">(비활성)</span>}</p>
              <p className="text-xs text-text-dim">{t.description}</p>
              <p className="text-xs text-text-dim mt-0.5">{t.verifyMethod} · 완료 {t.completedCount}건</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="number"
                defaultValue={t.pointsAwarded}
                onBlur={(e) => updatePoints(t.id, Number(e.target.value))}
                className="input text-sm w-20"
              />
              <button disabled={busy === t.id} onClick={() => toggleActive(t.id, !t.active)} className="btn-secondary px-3 py-1.5 text-sm">
                {t.active ? "비활성화" : "활성화"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
