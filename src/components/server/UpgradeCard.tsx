"use client";

import { useEffect, useState } from "react";

interface Product {
  id: string;
  name: string;
  ramMb: number;
  diskMb: number;
  priceMonthlyKrw: number;
}
interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

export default function UpgradeCard({ serverId, currentProductId }: { serverId: string; currentProductId: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<{ orderId: string; amountKrw: number; depositorName: string } | null>(null);
  const [bank, setBank] = useState<BankAccount | null>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    fetch("/api/catalog/products")
      .then((r) => r.json())
      .then((data: Product[]) => setProducts(data.filter((p) => p.id !== currentProductId)));
  }, [currentProductId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/upgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: selected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.requiresPayment) {
        setPayment({
          orderId: data.order.id,
          amountKrw: data.order.amountKrw,
          depositorName: data.order.depositorName,
        });
        const bankRes = await fetch("/api/payment/bank-account");
        if (bankRes.ok) setBank(await bankRes.json());
      } else {
        setApplied(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "처리 실패");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!payment) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/orders/${payment.orderId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === "PAID") {
        clearInterval(interval);
        setApplied(true);
        setPayment(null);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [payment]);

  if (applied) {
    return (
      <div className="card p-5">
        <p className="text-sm text-green">✅ 플랜이 변경됐어요. 적용을 위해 서버가 재시작될 수 있어요.</p>
      </div>
    );
  }

  if (payment) {
    return (
      <div className="card p-5 space-y-2">
        <h3 className="font-semibold text-sm">차액 입금 안내</h3>
        {bank && (
          <p className="text-sm">{bank.bankName} {bank.accountNumber} ({bank.accountHolder})</p>
        )}
        <p className="text-sm">입금자명: <strong className="text-accent">{payment.depositorName}</strong></p>
        <p className="text-sm">금액: <strong className="text-accent">{payment.amountKrw.toLocaleString()}원</strong></p>
        <p className="text-xs text-text-dim">입금하면 자동으로 플랜이 적용돼요.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-5 space-y-3">
      <h3 className="font-semibold text-sm">플랜 변경</h3>
      <div className="flex gap-2">
        <select className="input flex-1" value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">플랜 선택</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — RAM {(p.ramMb / 1024).toFixed(0)}GB · {p.priceMonthlyKrw.toLocaleString()}원/월
            </option>
          ))}
        </select>
        <button type="submit" disabled={busy || !selected} className="btn-primary px-4 py-2 text-sm">변경</button>
      </div>
      <p className="text-xs text-text-dim">더 비싼 플랜은 차액 입금 후 적용, 더 싼 플랜은 즉시 적용돼요(환불 없음).</p>
      {error && <p className="text-sm text-red">{error}</p>}
    </form>
  );
}
