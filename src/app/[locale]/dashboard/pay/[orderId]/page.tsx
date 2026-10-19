"use client";

import { use, useEffect, useState } from "react";
import CryptoPaymentOption from "@/components/CryptoPaymentOption";
import SuccessCheck from "@/components/SuccessCheck";
import BrandMark from "@/components/BrandMark";

interface Bank {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

interface OrderInfo {
  status: string;
  amountKrw: number;
  depositorName: string;
}

/**
 * 결제 전용 독립 창 — PointsPurchaseCard/AiCreditsCard/BillingOrderRow 등에서
 * window.open()으로 띄운다. 원래 화면(대시보드)에 입금 안내 패널이 그대로 펼쳐져 있으면
 * 산만하다는 피드백이 있어서, 결제 단계만 따로 떼어 새 창에서 진행한다.
 */
export default function PayPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [bank, setBank] = useState<Bank | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/orders/${orderId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setOrder)
      .catch(() => setError("주문을 찾을 수 없어요."));
    fetch("/api/payment/bank-account")
      .then((r) => (r.ok ? r.json() : null))
      .then(setBank)
      .catch(() => {});
  }, [orderId]);

  useEffect(() => {
    if (!order || order.status === "PAID") return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/orders/${orderId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === "PAID") {
        clearInterval(interval);
        setOrder(data);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [orderId, order]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="flex items-center gap-2 text-lg font-bold font-display justify-center mb-6">
          <BrandMark /> Burnae
        </div>

        {error && <p className="text-sm text-red text-center">{error}</p>}

        {!error && !order && <p className="text-sm text-text-dim text-center">불러오는 중...</p>}

        {order && order.status === "PAID" && (
          <div className="card-glow p-8 text-center space-y-4">
            <SuccessCheck size={48} confetti />
            <p className="font-semibold">결제가 완료됐어요!</p>
            <p className="text-sm text-text-dim">이 창은 닫아도 돼요. 원래 화면에서 자동으로 반영됐을 거예요.</p>
            <button onClick={() => window.close()} className="btn-primary px-5 py-2.5 text-sm">
              창 닫기
            </button>
          </div>
        )}

        {order && order.status !== "PAID" && (
          <div className="card mt-2 p-6 space-y-3">
            {bank && (
              <>
                <Row label="은행" value={bank.bankName} />
                <Row label="계좌번호" value={bank.accountNumber} />
                <Row label="예금주" value={bank.accountHolder} />
              </>
            )}
            <Row label="입금자명" value={order.depositorName} highlight />
            <Row label="입금 금액" value={`${order.amountKrw.toLocaleString()}원`} highlight />
            <p className="text-xs text-text-dim pt-2">
              입금자명과 금액이 정확히 일치해야 자동으로 확인돼요.
            </p>
            <div className="flex items-center gap-2 text-sm text-text-dim pt-2">
              <span className="animate-pulse">●</span> 입금 확인 대기 중...
            </div>
            <div className="pt-2">
              <CryptoPaymentOption orderId={orderId} amountKrw={order.amountKrw} />
            </div>
          </div>
        )}
      </div>
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
