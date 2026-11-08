"use client";

import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { useEffect, useState } from "react";
import Toggle from "@/components/Toggle";

type ShopItemKind =
  | "AI_CREDITS"
  | "DISCOUNT_COUPON"
  | "CUSTOM"
  | "RAM_UPGRADE"
  | "CPU_UPGRADE"
  | "DISK_UPGRADE"
  | "BACKUP_SLOT_UPGRADE"
  | "EXTRA_FREE_SLOT";

interface ShopItem {
  id: string;
  name: string;
  description: string | null;
  kind: ShopItemKind;
  pointsCost: number;
  amount: number | null;
  maxTotal: number | null;
  durationDays: number | null;
  active: boolean;
}

const KIND_LABEL: Record<ShopItemKind, string> = {
  AI_CREDITS: "포인트 지급",
  DISCOUNT_COUPON: "할인 쿠폰 발급 (계정)",
  CUSTOM: "기타(수동 처리, 계정)",
  RAM_UPGRADE: "서버 RAM 증설",
  CPU_UPGRADE: "서버 CPU 증설",
  DISK_UPGRADE: "서버 저장공간 증설",
  BACKUP_SLOT_UPGRADE: "서버 백업 슬롯 증설",
  EXTRA_FREE_SLOT: "무료 서버 슬롯 +1개 (기간 한정, 계정)",
};

const AMOUNT_LABEL: Record<ShopItemKind, string> = {
  AI_CREDITS: "지급 크레딧 수",
  DISCOUNT_COUPON: "할인율(%)",
  CUSTOM: "-",
  RAM_UPGRADE: "1회 증설량(MB, 예: 512=0.5GB)",
  CPU_UPGRADE: "1회 증설량(%)",
  DISK_UPGRADE: "1회 증설량(MB, 예: 1024=1GB)",
  BACKUP_SLOT_UPGRADE: "1회 증설량(개)",
  EXTRA_FREE_SLOT: "-",
};

const RESOURCE_KINDS = new Set<ShopItemKind>(["RAM_UPGRADE", "CPU_UPGRADE", "DISK_UPGRADE", "BACKUP_SLOT_UPGRADE"]);

const empty = {
  name: "",
  description: "",
  kind: "RAM_UPGRADE" as ShopItemKind,
  pointsCost: 300,
  amount: 512,
  maxTotal: "" as number | "",
  durationDays: 7 as number | "",
};

export default function AdminShopPage() {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/shop");
    setItems(await res.json());
  }
  useEffect(() => { load(); }, []);

  function startEdit(item: ShopItem) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      description: item.description ?? "",
      kind: item.kind,
      pointsCost: item.pointsCost,
      amount: item.amount ?? 0,
      maxTotal: item.maxTotal ?? "",
      durationDays: item.durationDays ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(empty);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body = {
        ...form,
        description: form.description || undefined,
        amount: form.kind === "CUSTOM" || form.kind === "EXTRA_FREE_SLOT" ? undefined : form.amount,
        maxTotal: RESOURCE_KINDS.has(form.kind) && form.maxTotal !== "" ? form.maxTotal : undefined,
        durationDays: form.kind === "EXTRA_FREE_SLOT" && form.durationDays !== "" ? form.durationDays : undefined,
      };
      const res = await fetch(editingId ? `/api/admin/shop/${editingId}` : "/api/admin/shop", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm(empty);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
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
      <PageHeader art="admin" title="포인트 상점" />
      <p className="text-sm text-text-dim mt-1">포인트로 교환하는 아이템 관리.</p>

      <div className="mt-6 space-y-2">
        {items.map((item, i) => (
          <div
            key={item.id}
            className="card-glow p-4 flex items-center justify-between flex-wrap gap-2 animate-fade-up"
            style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}
          >
            <div>
              <p className="font-medium text-sm">
                {item.name} <span className="text-text-dim text-xs">· {KIND_LABEL[item.kind]}</span>
              </p>
              <p className="text-xs text-text-dim mt-0.5">
                {item.pointsCost.toLocaleString()}P
                {item.amount != null && ` · 1회 +${item.amount.toLocaleString()}`}
                {item.maxTotal != null && ` · 최대 ${item.maxTotal.toLocaleString()}`}
                {item.durationDays != null && ` · ${item.durationDays}일간 유효`}
                {item.description && ` · ${item.description}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Toggle checked={item.active} onChange={() => toggleActive(item.id, item.active)} size="sm" />
              <button onClick={() => startEdit(item)} className="btn-secondary px-3 py-1.5 text-sm">
                수정
              </button>
              <button onClick={() => remove(item.id, item.name)} className="btn-secondary px-3 py-1.5 text-sm text-red">
                삭제
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && <EmptyState compact title="아직 등록된 상품이 없어요." />}
      </div>

      <form onSubmit={submit} className="card-glow p-5 mt-6 space-y-3">
        <h2 className="font-semibold">{editingId ? "상품 수정" : "새 상품 추가"}</h2>
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
              {Object.entries(KIND_LABEL)
                .filter(([k]) => k !== "AI_CREDITS")
                .map(([k, label]) => (
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
          {form.kind !== "CUSTOM" && form.kind !== "EXTRA_FREE_SLOT" && (
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
          {form.kind === "EXTRA_FREE_SLOT" && (
            <div>
              <label className="text-sm text-text-dim">유효 기간(일)</label>
              <input
                type="number"
                className="input w-full mt-1"
                value={form.durationDays}
                onChange={(e) => setForm({ ...form, durationDays: e.target.value === "" ? "" : Number(e.target.value) })}
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
        <div className="flex gap-2">
          <button type="submit" disabled={loading || !form.name} className="btn-primary px-5 py-2.5">
            {editingId ? "저장" : "추가"}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="btn-secondary px-5 py-2.5">
              취소
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
