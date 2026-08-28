"use client";

import { useEffect, useState } from "react";
import { Gift, Sparkles, Ticket, Package } from "lucide-react";

interface ShopItem {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  pointsCost: number;
  amount: number | null;
}

const KIND_ICON: Record<string, typeof Sparkles> = {
  AI_CREDITS: Sparkles,
  DISCOUNT_COUPON: Ticket,
  CUSTOM: Package,
};

export default function ShopSection({ points }: { points: number }) {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [remainingPoints, setRemainingPoints] = useState(points);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ itemId: string; couponCode?: string } | null>(null);

  useEffect(() => {
    // RAM/CPU/디스크/백업슬롯 증설 항목은 특정 서버를 대상으로 하는 별도 화면
    // (서버 개요 탭의 "포인트로 증설하기")에서 처리한다 — 여기선 계정 단위 교환만 보여준다
    fetch("/api/shop")
      .then((r) => r.json())
      .then((data: ShopItem[]) => setItems(data.filter((i) => i.kind in KIND_ICON)));
  }, []);

  async function redeem(item: ShopItem) {
    setBusy(item.id);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/shop/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRemainingPoints((p) => p - item.pointsCost);
      setResult({ itemId: item.id, couponCode: data.couponCode });
    } catch (err) {
      setError(err instanceof Error ? err.message : "교환 실패");
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-8 h-8 rounded-xl bg-purple/15 flex items-center justify-center">
          <Gift size={16} className="text-purple" />
        </span>
        <h2 className="font-semibold text-[15px]">포인트 상점</h2>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {items.map((item) => {
          const Icon = KIND_ICON[item.kind];
          const affordable = remainingPoints >= item.pointsCost;
          const redeemedHere = result?.itemId === item.id;
          return (
            <div key={item.id} className="card-glow p-4">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-xl bg-purple/15 flex items-center justify-center shrink-0">
                  <Icon size={16} className="text-purple" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{item.name}</p>
                  {item.description && <p className="text-xs text-text-dim mt-0.5">{item.description}</p>}
                </div>
              </div>
              <div className="flex items-center justify-between mt-3">
                <span className="text-sm font-semibold text-accent">{item.pointsCost.toLocaleString()}P</span>
                <button
                  onClick={() => redeem(item)}
                  disabled={busy !== null || !affordable}
                  className="btn-secondary px-3.5 py-1.5 text-xs"
                >
                  {busy === item.id ? "교환 중..." : affordable ? "교환하기" : "포인트 부족"}
                </button>
              </div>
              {redeemedHere && (
                <p className="text-xs text-green mt-2">
                  교환 완료!{result?.couponCode && ` 쿠폰 코드: ${result.couponCode}`}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="text-sm text-red mt-2">{error}</p>}
    </div>
  );
}
