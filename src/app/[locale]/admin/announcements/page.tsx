"use client";

import { useEffect, useState } from "react";
import Toggle from "@/components/Toggle";

interface Announcement {
  id: string;
  title: string;
  body: string;
  level: "INFO" | "WARNING" | "CRITICAL";
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

const LEVEL_LABEL: Record<Announcement["level"], string> = {
  INFO: "안내",
  WARNING: "경고",
  CRITICAL: "긴급",
};

const empty = { title: "", body: "", level: "INFO" as Announcement["level"], startsAt: "", endsAt: "" };

export default function AdminAnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/announcements");
    setItems(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          body: form.body,
          level: form.level,
          startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
          endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm(empty);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "생성 실패");
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(id: string, active: boolean) {
    await fetch(`/api/admin/announcements/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    await load();
  }

  async function remove(id: string) {
    if (!confirm("이 공지를 삭제할까요?")) return;
    await fetch(`/api/admin/announcements/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">공지사항</h1>
      <p className="text-sm text-text-dim mt-1">
        여기서 만든 공지는 랜딩페이지와 대시보드 상단에 배너로 노출돼요. 고객이 닫으면 그 브라우저에서는 다시 안 떠요.
      </p>

      <div className="mt-6 space-y-2">
        {items.map((a, i) => (
          <div
            key={a.id}
            className="card-glow p-4 flex items-center justify-between flex-wrap gap-2 animate-fade-up"
            style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}
          >
            <div className="min-w-0">
              <p className="font-medium text-sm">
                [{LEVEL_LABEL[a.level]}] {a.title} {!a.active && <span className="text-text-dim text-xs">(비활성)</span>}
              </p>
              <p className="text-xs text-text-dim mt-0.5">{a.body}</p>
              {(a.startsAt || a.endsAt) && (
                <p className="text-xs text-text-dim mt-0.5">
                  노출 기간: {a.startsAt ? new Date(a.startsAt).toLocaleString("ko-KR") : "제한 없음"}
                  {" ~ "}
                  {a.endsAt ? new Date(a.endsAt).toLocaleString("ko-KR") : "제한 없음"}
                </p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <Toggle checked={a.active} onChange={() => toggleActive(a.id, !a.active)} size="sm" />
              <button onClick={() => remove(a.id)} className="text-red text-sm px-2">삭제</button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-text-dim">등록된 공지가 없어요.</p>}
      </div>

      <form onSubmit={create} className="card-glow p-5 mt-6 space-y-3">
        <h2 className="font-semibold">새 공지 등록</h2>
        <div>
          <label className="text-sm text-text-dim">제목</label>
          <input className="input w-full mt-1" maxLength={100} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </div>
        <div>
          <label className="text-sm text-text-dim">내용</label>
          <textarea className="input w-full mt-1" rows={3} maxLength={1000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="text-sm text-text-dim">중요도</label>
            <select className="input w-full mt-1" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as Announcement["level"] })}>
              <option value="INFO">안내</option>
              <option value="WARNING">경고</option>
              <option value="CRITICAL">긴급</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-text-dim">노출 시작 (선택)</label>
            <input type="datetime-local" className="input w-full mt-1" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
          </div>
          <div>
            <label className="text-sm text-text-dim">노출 종료 (선택)</label>
            <input type="datetime-local" className="input w-full mt-1" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
          </div>
        </div>
        {error && <p className="text-sm text-red">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary px-5 py-2.5">등록</button>
      </form>
    </div>
  );
}
