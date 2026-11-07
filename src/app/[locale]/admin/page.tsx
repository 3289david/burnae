"use client";

import { useEffect, useState } from "react";
import Toggle from "@/components/Toggle";

interface RoleShopItem {
  id: string;
  discordRoleId: string;
  name: string;
  pointsCost: number;
  sortOrder: number;
  active: boolean;
}

const emptyForm = { discordRoleId: "", name: "", pointsCost: 1000, sortOrder: 0 };

/**
 * 포인트로 교환하는 디스코드 칭호/역할 — 홍보 포인트(/admin/promotions)나 포인트 상점
 * (/admin/shop, 호스팅 혜택 교환)과는 완전히 별개의 화면이다. 봇의 /포인트 패널 "🏷️ 칭호/역할
 * 구매" 버튼에서 이 목록이 그대로 나온다.
 */
export default function AdminRoleShopPage() {
  const [items, setItems] = useState<RoleShopItem[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await fetch("/api/admin/role-shop");
    if (res.ok) setItems(await res.json());
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch("/api/admin/role-shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "추가 실패");
    }
  }

  async function toggleActive(id: string, active: boolean) {
    await fetch(`/api/admin/role-shop/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    await load();
  }

  async function remove(id: string) {
    if (!confirm("이 상품을 삭제할까요?")) return;
    await fetch(`/api/admin/role-shop/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">칭호/역할 상점</h1>
      <p className="text-sm text-text-dim mt-1">포인트로 교환하는 디스코드 역할 관리.</p>

      <div className="mt-6 space-y-2">
        {items.map((item, i) => (
          <div
            key={item.id}
            className="card-glow p-4 flex items-center justify-between flex-wrap gap-2 animate-fade-up"
            style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}
          >
            <div className="min-w-0">
              <p className="font-medium text-sm">
                {item.name} — {item.pointsCost.toLocaleString()}P {!item.active && <span className="text-text-dim text-xs">(비활성)</span>}
              </p>
              <p className="text-xs text-text-dim mt-0.5 truncate">역할 ID: {item.discordRoleId}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Toggle checked={item.active} onChange={() => toggleActive(item.id, !item.active)} size="sm" />
              <button onClick={() => remove(item.id)} className="text-red text-sm px-2">삭제</button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-text-dim">등록된 상품이 없어요.</p>}
      </div>

      <form onSubmit={add} className="card-glow p-5 mt-4 space-y-3">
        <h3 className="font-semibold">새 상품 추가</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="text-sm text-text-dim">이름</label>
            <input
              className="input w-full mt-1"
              placeholder="예: 빨간 칭호"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="text-sm text-text-dim">역할 ID</label>
            <input
              className="input w-full mt-1"
              value={form.discordRoleId}
              onChange={(e) => setForm({ ...form, discordRoleId: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="text-sm text-text-dim">가격(P)</label>
            <input
              type="number"
              className="input w-full mt-1"
              value={form.pointsCost}
              onChange={(e) => setForm({ ...form, pointsCost: Number(e.target.value) })}
              required
            />
          </div>
        </div>
        {error && <p className="text-sm text-red">{error}</p>}
        <button type="submit" className="btn-primary px-5 py-2.5">추가</button>
      </form>
    </div>
  );
}
