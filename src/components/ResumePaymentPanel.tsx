"use client";

import { useEffect, useState } from "react";
import CryptoPaymentOption from "@/components/CryptoPaymentOption";

interface Bank {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

export default function ResumePaymentPanel({
  orderId,
  amountKrw,
  depositorName,
  onPaid,
}: {
  orderId: string;
  amountKrw: number;
  depositorName: string;
  onPaid: () => void;
}) {
  const [bank, setBank] = useState<Bank | null>(null);

  useEffect(() => {
    fetch("/api/payment/bank-account")
      .then((r) => (r.ok ? r.json() : null))
      .then(setBank)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/orders/${orderId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === "PAID") onPaid();
    }, 4000);
    return () => clearInterval(interval);
  }, [orderId, onPaid]);

  return (
    <div className="card mt-3 p-4 space-y-2.5 animate-toast-in">
      {bank && (
        <>
          <Row label="은행" value={bank.bankName} />
          <Row label="계좌번호" value={bank.accountNumber} />
          <Row label="예금주" value={bank.accountHolder} />
        </>
      )}
      <Row label="입금자명" value={depositorName} highlight />
      <Row label="입금 금액" value={`${amountKrw.toLocaleString()}원`} highlight />
      <p className="text-xs text-text-dim pt-1">입금자명과 금액이 정확히 일치해야 자동으로 확인돼요.</p>
      <div className="flex items-center gap-2 text-xs text-text-dim pt-1">
        <span className="animate-pulse">●</span> 입금 확인 대기 중...
      </div>
      <CryptoPaymentOption orderId={orderId} amountKrw={amountKrw} />
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-text-dim">{label}</span>
      <span className={highlight ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}
