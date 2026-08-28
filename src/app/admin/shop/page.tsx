"use client";

import { useEffect, useState } from "react";

type ShopItemKind =
  | "AI_CREDITS"
  | "DISCOUNT_COUPON"
  | "CUSTOM"
  | "RAM_UPGRADE"
  | "CPU_UPGRADE"
  | "DISK_UPGRADE"
  | "BACKUP_SLOT_UPGRADE";

interface ShopItem {
  id: string;
  name: string;
  description: string | null;
  kind: ShopItemKind;
  pointsCost: number;
  amount: number | null;
  maxTotal: number | null;
  active: boolean;
}

const KIND_LABEL: Record<ShopItemKind, string> = {
  AI_CREDITS: "AI 크레딧 지급 (계정)",
  DISCOUNT_COUPON: "할인 쿠폰 발급 (계정)",
  CUSTOM: "기타(수동 처리, 계정)",
  RAM_UPGRADE: "서버 RAM 증설",
  CPU_UPGRADE: "서버 CPU 증설",
  DISK_UPGRADE: "서버 저장공간 증설",
  BACKUP_SLOT_UPGRADE: "서버 백업 슬롯 증설",
};

const AMOUNT_LABEL: Record<ShopItemKind, string> = {
  AI_CREDITS: "지급 크레딧 수",
  DISCOUNT_COUPON: "할인율(%)",
  CUSTOM: "-",
  RAM_UPGRADE: "1회 증설량(MB, 예: 512=0.5GB)",
  CPU_UPGRADE: "1회 증설량(%)",
  DISK_UPGRADE: "1회 증설량(MB, 예: 1024=1GB)",
  BACKUP_SLOT_UPGRADE: "1회 증설량(개)",
};

const RESOURCE_KINDS = new Set<ShopItemKind>(["RAM_UPGRADE", "CPU_UPGRADE", "DISK_UPGRADE", "BACKUP_SLOT_UPGRADE"]);

const empty = {
  name: "",
  description: "",
  kind: "RAM_UPGRADE" as ShopItemKind,
  pointsCost: 300,
  amount: 512,
  maxTotal: "" as number | "",
};

export default function AdminShopPage() {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/shop");
    setItems(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          description: form.description || undefined,
          amount: form.kind === "CUSTOM" ? undefined : form.amount,
          maxTotal: RESOURCE_KINDS.has(form.kind) && form.maxTotal !== "" ? form.maxTotal : undefined,
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
    await fetch(`/api/admin/shop/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    await load();
  }

  async function remove(id: string, name: string) {
    if (!confirm(`"${name}" 상품을 삭제할까요?`)) return;
    const res = await fetch(`/api/admin/shop/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) alert(data?.error ?? "삭제 실패");
    else if (data?.message) alert(data.message);
    await load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">포인트 상점</h1>
      <p className="text-sm text-text-dim mt-1">
        홍보 포인트로 교환할 수 있는 아이템을 관리해요. RAM/CPU/저장공간/백업 슬롯 증설은 무료
        서버의 &ldquo;포인트로 증설하기&rdquo;에 뜨고, AI 크레딧·쿠폰·기타는 홍보 포인트 페이지의
        포인트 상점에 떠요.
      </p>

      <div className="mt-6 space-y-2">
        {items.map((item) => (
          <div key={item.id} className="card-glow p-4 flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="font-medium text-sm">
                {item.name} <span className="text-text-dim text-xs">· {KIND_LABEL[item.kind]}</span>
              </p>
              <p className="text-xs text-text-dim mt-0.5">
                {item.pointsCost.toLocaleString()}P
                {item.amount != null && ` · 1회 +${item.amount.toLocaleString()}`}
                {item.maxTotal != null && ` · 최대 ${item.maxTotal.toLocaleString()}`}
                {item.description && ` · ${item.description}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toggleActive(item.id, item.active)} className="btn-secondary px-3 py-1.5 text-sm">
                {item.active ? "비활성화" : "활성화"}
              </button>
              <button onClick={() => remove(item.id, item.name)} className="btn-secondary px-3 py-1.5 text-sm text-red">
                삭제
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-text-dim">아직 등록된 상품이 없어요.</p>}
      </div>

      <form onSubmit={create} className="card-glow p-5 mt-6 space-y-3">
        <h2 className="font-semibold">새 상품 추가</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-text-dim">이름</label>
            <input className="input w-full mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="text-sm text-text-dim">종류</label>
            <select
              className="input w-full mt-1"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as ShopItemKind })}
            >
              {Object.entries(KIND_LABEL).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-text-dim">필요 포인트</label>
            <input
              type="number"
              className="input w-full mt-1"
              value={form.pointsCost}
              onChange={(e) => setForm({ ...form, pointsCost: Number(e.target.value) })}
            />
          </div>
          {form.kind !== "CUSTOM" && (
            <div>
              <label className="text-sm text-text-dim">{AMOUNT_LABEL[form.kind]}</label>
              <input
                type="number"
                className="input w-full mt-1"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
              />
            </div>
          )}
          {RESOURCE_KINDS.has(form.kind) && (
            <div>
              <label className="text-sm text-text-dim">서버당 최대 누적치 (선택, 비우면 무제한)</label>
              <input
                type="number"
                className="input w-full mt-1"
                value={form.maxTotal}
                onChange={(e) => setForm({ ...form, maxTotal: e.target.value === "" ? "" : Number(e.target.value) })}
              />
            </div>
          )}
          <div className="sm:col-span-2">
            <label className="text-sm text-text-dim">설명 (선택)</label>
            <input
              className="input w-full mt-1"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </div>
        {error && <p className="text-sm text-red">{error}</p>}
        <button type="submit" disabled={loading || !form.name} className="btn-primary px-5 py-2.5">
          추가
        </button>
      </form>
    </div>
  );
}
