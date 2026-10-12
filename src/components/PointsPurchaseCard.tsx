"use client";

import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import SuccessCheck from "@/components/SuccessCheck";

const PACKAGES = [
  { points: 500, priceKrw: 500 },
  { points: 2500, priceKrw: 2500 },
  { points: 10000, priceKrw: 10000 },
];

interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

/** 돈으로 포인트를 직접 충전 — AI 크레딧 충전 카드와 동일한 하나은행 입금 확인 패턴 */
export default function PointsPurchaseCard() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<{ orderId: string; amountKrw: number; depositorName: string } | null>(null);
  const [bank, setBank] = useState<BankAccount | null>(null);
  const [justCharged, setJustCharged] = useState(false);

  async function buy(pkg: (typeof PACKAGES)[number]) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/points/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: pkg.points }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.status === "PAID") {
        setOpen(false);
        setJustCharged(true);
        setTimeout(() => window.location.reload(), 1200);
        return;
      }
      setPayment({ orderId: data.id, amountKrw: data.amountKrw, depositorName: data.depositorName });
      const bankRes = await fetch("/api/payment/bank-account");
      if (bankRes.ok) setBank(await bankRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "결제 요청 실패");
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
        setPayment(null);
        setOpen(false);
        setJustCharged(true);
        setTimeout(() => window.location.reload(), 1200);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [payment]);

  return (
    <div className="card-glow p-4 mb-3 animate-fade-up">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-yellow/15 flex items-center justify-center shrink-0">
            <Coins size={15} className="text-yellow" />
          </span>
          <div>
            <p className="text-sm font-medium">포인트 충전</p>
            <p className="text-xs text-text-dim">1원 = 1포인트 · 입금 확인 후 자동 충전</p>
          </div>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="btn-secondary px-3.5 py-1.5 text-xs shrink-0 active:scale-95 transition-transform">
          {open ? "닫기" : "충전하기"}
        </button>
      </div>

      {justCharged && (
        <div className="animate-toast-in mt-3 pt-3 border-t border-border flex items-center gap-2 text-sm text-green">
          <SuccessCheck size={24} confetti />
          충전됐어요!
        </div>
      )}

      {open && !payment && (
        <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 gap-2">
          {PACKAGES.map((pkg, i) => (
            <button
              key={pkg.points}
              onClick={() => buy(pkg)}
              disabled={busy}
              className="rounded-xl border border-border bg-surface p-3 text-center hover:border-accent/40 hover:bg-surface-2 transition-all duration-150 active:scale-95 animate-fade-up"
              style={{ animationDelay: `${i * 0.04}s` }}
            >
              <p className="font-semibold text-sm">{pkg.points.toLocaleString()}P</p>
              <p className="text-xs text-text-dim mt-0.5">{pkg.priceKrw.toLocaleString()}원</p>
            </button>
          ))}
        </div>
      )}

      {payment && (
        <div className="mt-3 pt-3 border-t border-border space-y-1.5 text-sm">
          {bank && <p>{bank.bankName} {bank.accountNumber} ({bank.accountHolder})</p>}
          <p>입금자명: <strong className="text-accent">{payment.depositorName}</strong></p>
          <p>금액: <strong className="text-accent">{payment.amountKrw.toLocaleString()}원</strong></p>
          <p className="text-xs text-text-dim flex items-center gap-1.5">
            <span className="animate-pulse">●</span> 입금 확인 대기 중... (자동으로 충전돼요)
          </p>
        </div>
      )}

      {error && <p className="text-xs text-red mt-2">{error}</p>}
    </div>
  );
}
