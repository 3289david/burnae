"use client";

import { useEffect, useState } from "react";

interface Preorder {
  id: string;
  amountKrw: number;
  serverNameRequested: string | null;
  createdAt: string;
  user: { name: string; email: string };
  product: { name: string } | null;
  productNameSnapshot: string | null;
}

export default function AdminPreordersPage() {
  const [items, setItems] = useState<Preorder[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/preorders");
    setItems(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function fulfill(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/preorders/${id}/fulfill`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "배치 실패");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">선주문 대기 목록</h1>
      <p className="text-sm text-text-dim mt-1">
        결제(또는 포인트 교환)는 끝났지만 아직 노드 자리가 없어서 서버가 안 만들어진 주문이에요.
        노드를 늘리거나 다른 서버를 정리한 뒤 &ldquo;지금 배치하기&rdquo;를 누르면 즉시 생성을 시도해요.
        (호스팅 설정에서 &ldquo;선주문 자동 처리&rdquo;를 켜두면 이 화면 없이도 자리 나는 대로 자동으로 처리돼요.)
      </p>

      <div className="mt-6 space-y-2">
        {items.map((o, i) => (
          <div
            key={o.id}
            className="card-glow p-4 flex flex-wrap items-center justify-between gap-2 animate-fade-up"
            style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}
          >
            <div className="min-w-0">
              <p className="font-medium text-sm">
                {o.serverNameRequested ?? "이름 미지정"} · {o.productNameSnapshot ?? o.product?.name ?? "삭제된 상품"}
              </p>
              <p className="text-xs text-text-dim mt-0.5">
                {o.user.name} ({o.user.email}) · {o.amountKrw.toLocaleString()}원 ·{" "}
                {new Date(o.createdAt).toLocaleString("ko-KR")}
              </p>
            </div>
            <button onClick={() => fulfill(o.id)} disabled={busy === o.id} className="btn-primary px-4 py-1.5 text-sm shrink-0">
              {busy === o.id ? "배치 중..." : "지금 배치하기"}
            </button>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-text-dim">대기 중인 선주문이 없어요.</p>}
      </div>
      {error && <p className="text-sm text-red mt-3">{error}</p>}
    </div>
  );
}
