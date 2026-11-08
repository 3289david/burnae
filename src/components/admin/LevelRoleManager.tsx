"use client";

import { useEffect, useState } from "react";

interface LevelRoleItem {
  id: string;
  level: number;
  discordRoleId: string;
  name: string;
}

const emptyForm = { level: 5, discordRoleId: "", name: "" };

/**
 * 레벨↔칭호(역할) 매핑 관리 — 레벨 n이 되면(또는 그 이상이면 가장 높은 등급) 이 역할을 준다.
 * 실제 부여/교체는 봇(activityRewards.ts applyLevelRole)이 레벨업 때마다 처리한다.
 */
export default function LevelRoleManager() {
  const [items, setItems] = useState<LevelRoleItem[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await fetch("/api/admin/level-roles");
    if (res.ok) setItems(await res.json());
  }

  function startEdit(item: LevelRoleItem) {
    setEditingId(item.id);
    setForm({ level: item.level, discordRoleId: item.discordRoleId, name: item.name });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch(editingId ? `/api/admin/level-roles/${editingId}` : "/api/admin/level-roles", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    }
  }

  async function remove(id: string) {
    if (!confirm("이 등급을 삭제할까요?")) return;
    await fetch(`/api/admin/level-roles/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="card-glow p-5 mt-6">
      <h2 className="font-semibold mb-1">레벨 ↔ 칭호(역할) 매핑</h2>
      <p className="text-xs text-text-dim mb-3">그 레벨에 도달하면 이 역할로 자동 교체돼요(낮은 등급 역할은 빠짐).</p>

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-2 border-b border-border/50 py-2 text-sm">
            <div className="min-w-0">
              <span className="font-medium">레벨 {item.level}</span>
              <span className="text-text-dim"> — {item.name}</span>
              <p className="text-xs text-text-dim font-mono truncate">역할 ID: {item.discordRoleId}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => startEdit(item)} className="text-xs px-2">수정</button>
              <button onClick={() => remove(item.id)} className="text-red text-xs px-2">삭제</button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-text-dim">등록된 등급이 없어요.</p>}
      </div>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <h3 className="text-sm font-semibold">{editingId ? "등급 수정" : "새 등급 추가"}</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-text-dim">레벨</label>
            <input
              type="number"
              className="input w-full mt-1 text-sm"
              value={form.level}
              onChange={(e) => setForm({ ...form, level: Number(e.target.value) })}
              required
            />
          </div>
          <div>
            <label className="text-xs text-text-dim">이름(참고용)</label>
            <input
              className="input w-full mt-1 text-sm"
              placeholder="예: 단골"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="text-xs text-text-dim">역할 ID</label>
            <input
              className="input w-full mt-1 text-sm"
              value={form.discordRoleId}
              onChange={(e) => setForm({ ...form, discordRoleId: e.target.value })}
              required
            />
          </div>
        </div>
        {error && <p className="text-xs text-red">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary px-4 py-2 text-sm">{editingId ? "저장" : "추가"}</button>
          {editingId && <button type="button" onClick={cancelEdit} className="btn-secondary px-4 py-2 text-sm">취소</button>}
        </div>
      </form>
    </div>
  );
}
