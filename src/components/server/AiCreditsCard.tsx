"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import SuccessCheck from "@/components/SuccessCheck";
import CountUp from "@/components/CountUp";

const PACKAGES = [
  { credits: 100, priceKrw: 3000 },
  { credits: 500, priceKrw: 12000 },
  { credits: 1500, priceKrw: 30000 },
];

interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

export default function AiCreditsCard() {
  const [credits, setCredits] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<{ orderId: string; amountKrw: number; depositorName: string } | null>(null);
  const [bank, setBank] = useState<BankAccount | null>(null);
  const [justCharged, setJustCharged] = useState(false);

  function loadBalance() {
    fetch("/api/ai-credits/balance")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setCredits(data.credits));
  }
  useEffect(loadBalance, []);

  async function buy(pkg: (typeof PACKAGES)[number]) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-credits/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credits: pkg.credits }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.status === "PAID") {
        loadBalance();
        setOpen(false);
        setJustCharged(true);
        setTimeout(() => setJustCharged(false), 3000);
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
        loadBalance();
        setJustCharged(true);
        setTimeout(() => setJustCharged(false), 3000);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [payment]);

  return (
    <div className="card-glow p-4 mb-3 animate-fade-up">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-purple/15 flex items-center justify-center shrink-0">
            <Sparkles size={15} className="text-purple" />
          </span>
          <div>
            <p className="text-sm font-medium">AI 크레딧</p>
            <p className="text-xs text-text-dim">
              메시지 1건당 1크레딧 소모 · 보유{" "}
              {credits === null ? "-" : <CountUp value={credits} format={(n) => n.toLocaleString("ko-KR")} />}개
            </p>
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
              key={pkg.credits}
              onClick={() => buy(pkg)}
              disabled={busy}
              className="rounded-xl border border-border bg-surface p-3 text-center hover:border-accent/40 hover:bg-surface-2 transition-all duration-150 active:scale-95 animate-fade-up"
              style={{ animationDelay: `${i * 0.04}s` }}
            >
              <p className="font-semibold text-sm">{pkg.credits.toLocaleString()}개</p>
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
