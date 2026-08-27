"use client";

import { useEffect, useState } from "react";

interface Template { id: string; displayName: string }
interface Product {
  id: string;
  name: string;
  ramMb: number;
  cpuPercent: number;
  diskMb: number;
  backupSlots: number;
  priceMonthlyKrw: number;
  active: boolean;
  pointsRedeemable: boolean;
  pointsCost: number | null;
  preorderPriceKrw: number | null;
  aiCreditsPerMonth: number;
  allowedTemplates: Template[];
}

const empty = {
  name: "",
  ramGb: 4,
  cpuPercent: 200,
  diskGb: 20,
  backupSlots: 3,
  priceMonthlyKrw: 20000,
  allowedTemplateIds: [] as string[],
  pointsRedeemable: false,
  pointsCost: 1000,
  preorderPriceKrw: "" as number | "",
  aiCreditsPerMonth: 0,
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const [p, t] = await Promise.all([
      fetch("/api/admin/products").then((r) => r.json()),
      fetch("/api/admin/templates").then((r) => r.json()),
    ]);
    setProducts(p);
    setTemplates(t);
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          ramMb: form.ramGb * 1024,
          cpuPercent: form.cpuPercent,
          diskMb: form.diskGb * 1024,
          backupSlots: form.backupSlots,
          priceMonthlyKrw: form.priceMonthlyKrw,
          allowedTemplateIds: form.allowedTemplateIds,
          pointsRedeemable: form.pointsRedeemable,
          pointsCost: form.pointsRedeemable ? form.pointsCost : undefined,
          preorderPriceKrw: form.preorderPriceKrw === "" ? undefined : form.preorderPriceKrw,
          aiCreditsPerMonth: form.aiCreditsPerMonth,
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
    await fetch(`/api/admin/products/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    await load();
  }

  async function updatePreorderPrice(id: string, value: string) {
    await fetch(`/api/admin/products/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preorderPriceKrw: value === "" ? null : Number(value) }),
    });
    await load();
  }

  async function updateAiCredits(id: string, value: string) {
    await fetch(`/api/admin/products/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiCreditsPerMonth: value === "" ? 0 : Number(value) }),
    });
    await load();
  }

  async function deleteProduct(id: string, name: string) {
    if (!confirm(`"${name}" 상품을 삭제할까요?`)) return;
    const res = await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (data?.message) alert(data.message);
    await load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">상품</h1>

      <div className="mt-6 space-y-2">
        {products.map((p) => (
          <div key={p.id} className="card p-4 flex items-center justify-between flex-wrap gap-2">
            <div className="min-w-0">
              <p className="font-medium">
                {p.name} {!p.active && <span className="text-text-dim text-xs">(비활성)</span>}
                {p.pointsRedeemable && <span className="text-accent text-xs ml-1">(포인트 {p.pointsCost?.toLocaleString()}P 교환)</span>}
              </p>
              <p className="text-xs text-text-dim mt-0.5">
                RAM {(p.ramMb / 1024).toFixed(1)}GB · CPU {p.cpuPercent}% · 디스크 {(p.diskMb / 1024).toFixed(1)}GB ·
                백업 {p.backupSlots}개 · {p.priceMonthlyKrw.toLocaleString()}원/월 · AI 크레딧 {p.aiCreditsPerMonth}개/월 ·{" "}
                {p.allowedTemplates.map((t) => t.displayName).join(", ")}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <label className="text-xs text-text-dim flex items-center gap-1">
                선주문가(원)
                <input
                  type="number"
                  placeholder="정가와 동일"
                  defaultValue={p.preorderPriceKrw ?? ""}
                  onBlur={(e) => updatePreorderPrice(p.id, e.target.value)}
                  className="input w-24 text-sm"
                />
              </label>
              <label className="text-xs text-text-dim flex items-center gap-1">
                AI 크레딧/월
                <input
                  type="number"
                  defaultValue={p.aiCreditsPerMonth}
                  onBlur={(e) => updateAiCredits(p.id, e.target.value)}
                  className="input w-20 text-sm"
                />
              </label>
              <button onClick={() => toggleActive(p.id, !p.active)} className="btn-secondary px-3 py-1.5 text-sm">
                {p.active ? "비활성화" : "활성화"}
              </button>
              <button
                onClick={() => deleteProduct(p.id, p.name)}
                className="px-3 py-1.5 text-sm rounded-full border border-red/30 text-red hover:bg-red/10"
              >
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={create} className="card p-5 mt-6 space-y-3">
        <h2 className="font-semibold">새 상품 추가</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="sm:col-span-3">
            <label className="text-sm text-text-dim">상품명</label>
            <input className="input w-full mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <NumField label="RAM (GB)" value={form.ramGb} onChange={(v) => setForm({ ...form, ramGb: v })} />
          <NumField label="CPU (%)" value={form.cpuPercent} onChange={(v) => setForm({ ...form, cpuPercent: v })} />
          <NumField label="디스크 (GB)" value={form.diskGb} onChange={(v) => setForm({ ...form, diskGb: v })} />
          <NumField label="백업 슬롯" value={form.backupSlots} onChange={(v) => setForm({ ...form, backupSlots: v })} />
          <NumField label="월 가격 (원)" value={form.priceMonthlyKrw} onChange={(v) => setForm({ ...form, priceMonthlyKrw: v })} />
          <NumField label="AI 크레딧 (개/월)" value={form.aiCreditsPerMonth} onChange={(v) => setForm({ ...form, aiCreditsPerMonth: v })} />
          <div>
            <label className="text-sm text-text-dim">선주문가 (원, 선택)</label>
            <input
              type="number"
              placeholder="비우면 정가와 동일"
              className="input w-full mt-1"
              value={form.preorderPriceKrw}
              onChange={(e) => setForm({ ...form, preorderPriceKrw: e.target.value === "" ? "" : Number(e.target.value) })}
            />
          </div>
        </div>
        <div>
          <label className="text-sm text-text-dim">선택 가능한 서버 종류</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {templates.map((t) => {
              const checked = form.allowedTemplateIds.includes(t.id);
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() =>
                    setForm({
                      ...form,
                      allowedTemplateIds: checked
                        ? form.allowedTemplateIds.filter((id) => id !== t.id)
                        : [...form.allowedTemplateIds, t.id],
                    })
                  }
                  className={`px-3 py-1.5 rounded-full text-sm border ${checked ? "bg-accent border-accent text-white" : "border-border text-text-dim"}`}
                >
                  {t.displayName}
                </button>
              );
            })}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.pointsRedeemable}
            onChange={(e) => setForm({ ...form, pointsRedeemable: e.target.checked })}
          />
          홍보 포인트로 교환 가능 (예: 무료 체험 서버)
        </label>
        {form.pointsRedeemable && (
          <NumField label="필요 포인트" value={form.pointsCost} onChange={(v) => setForm({ ...form, pointsCost: v })} />
        )}
        {error && <p className="text-sm text-red">{error}</p>}
        <button type="submit" disabled={loading || form.allowedTemplateIds.length === 0} className="btn-primary px-5 py-2.5">
          추가
        </button>
      </form>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-sm text-text-dim">{label}</label>
      <input type="number" className="input w-full mt-1" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
