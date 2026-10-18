"use client";

import { useEffect, useState } from "react";

interface PendingOrder {
  id: string;
  amountKrw: number;
  depositorName: string;
  serverNameRequested: string | null;
  createdAt: string;
  user: { name: string; email: string };
  product: { name: string; priceMonthlyKrw: number } | null;
  productNameSnapshot: string | null;
}

interface PendingGrant {
  id: string;
  serverNameRequested: string | null;
  createdAt: string;
  user: { name: string; email: string };
}

export default function AdminOrdersPage() {
  const [items, setItems] = useState<PendingOrder[]>([]);
  const [grants, setGrants] = useState<PendingGrant[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/orders");
    if (res.ok) setItems(await res.json());
    const grantsRes = await fetch("/api/admin/pending-grants");
    if (grantsRes.ok) setGrants(await grantsRes.json());
  }
  useEffect(() => { load(); }, []);

  async function approve(id: string) {
    if (!confirm("입금을 확인하셨나요? 승인하면 바로 서버가 생성/처리돼요.")) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${id}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "승인 실패");
    } finally {
      setBusy(null);
    }
  }

  async function cancelGrant(id: string) {
    if (!confirm("이 지급 건을 취소할까요? 유저가 더 이상 이 서버를 받을 수 없게 돼요.")) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${id}/cancel`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "취소 실패");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">주문 (입금 대기)</h1>
      <p className="text-sm text-text-dim mt-1">
        하나은행 자동 매칭을 기다리지 않고, 입금을 다른 방법으로 확인했다면 여기서 직접 승인할 수 있어요.
      </p>

      {error && <p className="text-sm text-red mt-3">{error}</p>}

      <div className="mt-6 space-y-2">
        {items.map((o, i) => (
          <div
            key={o.id}
            className="card-glow p-4 flex items-center justify-between flex-wrap gap-3 animate-fade-up"
            style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}
          >
            <div className="min-w-0">
              <p className="font-medium">
                {o.user.name} <span className="text-text-dim text-xs">({o.user.email})</span>
              </p>
              <p className="text-xs text-text-dim mt-0.5">
                {o.productNameSnapshot ?? o.product?.name ?? "삭제된 상품"} · {o.serverNameRequested ?? ""} · 입금자명 <b>{o.depositorName}</b> ·{" "}
                <b className="text-accent">{o.amountKrw.toLocaleString()}원</b> ·{" "}
                {new Date(o.createdAt).toLocaleString("ko-KR")}
              </p>
            </div>
            <button
              onClick={() => approve(o.id)}
              disabled={busy === o.id}
              className="btn-primary px-4 py-2 text-sm shrink-0 active:scale-95 transition-transform"
            >
              {busy === o.id ? "처리 중..." : "입금 확인 · 승인"}
            </button>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-text-dim">대기 중인 주문이 없어요.</p>}
      </div>

      <h2 className="text-xl font-bold mt-10">지급됐지만 아직 서버를 안 만든 건</h2>
      <p className="text-sm text-text-dim mt-1">
        `/admin/users`에서 지급한 서버 중 유저가 아직 종류를 안 고른 건이에요. 잘못 지급했다면 여기서 취소할 수 있어요.
      </p>
      <div className="mt-4 space-y-2">
        {grants.map((g, i) => (
          <div
            key={g.id}
            className="card-glow p-4 flex items-center justify-between flex-wrap gap-3 animate-fade-up"
            style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}
          >
            <div className="min-w-0">
              <p className="font-medium">
                {g.user.name} <span className="text-text-dim text-xs">({g.user.email})</span>
              </p>
              <p className="text-xs text-text-dim mt-0.5">
                {g.serverNameRequested} · {new Date(g.createdAt).toLocaleString("ko-KR")}
              </p>
            </div>
            <button
              onClick={() => cancelGrant(g.id)}
              disabled={busy === g.id}
              className="btn-secondary text-red px-4 py-2 text-sm shrink-0 active:scale-95 transition-transform"
            >
              {busy === g.id ? "취소 중..." : "지급 취소"}
            </button>
          </div>
        ))}
        {grants.length === 0 && <p className="text-sm text-text-dim">지급 대기 중인 건이 없어요.</p>}
      </div>
    </div>
  );
}
