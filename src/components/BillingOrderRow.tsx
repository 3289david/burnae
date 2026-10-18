"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import ResumePaymentPanel from "@/components/ResumePaymentPanel";

export interface BillingOrderInfo {
  id: string;
  status: string;
  preorderWaiting: boolean;
  amountKrw: number;
  depositorName: string;
  discountKrw: number;
  createdAtText: string;
  titleText: string;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "입금 대기",
  PAID: "결제 완료",
  CANCELLED: "취소됨",
  EXPIRED: "만료됨",
  REFUNDED: "환불됨",
};
const STATUS_COLOR: Record<string, string> = {
  PENDING: "var(--yellow)",
  PAID: "var(--green)",
  CANCELLED: "var(--text-dim)",
  EXPIRED: "var(--red)",
  REFUNDED: "var(--blue)",
};

export default function BillingOrderRow({ order }: { order: BillingOrderInfo }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const canResume = order.status === "PENDING" && !order.preorderWaiting;

  const statusText = order.preorderWaiting ? "선주문 대기중" : STATUS_LABEL[order.status];
  const color = order.preorderWaiting ? "var(--yellow)" : STATUS_COLOR[order.status];

  return (
    <div className="card-glow p-4 animate-fade-up">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{order.titleText}</p>
          <p className="text-xs text-text-dim mt-0.5">
            {order.createdAtText} · 입금자명 {order.depositorName}
            {order.discountKrw > 0 && ` · 할인 ${order.discountKrw.toLocaleString()}원`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canResume && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="btn-secondary px-3 py-1.5 text-xs active:scale-95 transition-transform"
            >
              {expanded ? "접기" : "결제 계속하기"}
            </button>
          )}
          <div className="text-right">
            <p className="font-semibold text-sm">{order.amountKrw.toLocaleString()}원</p>
            <span
              className="inline-block mt-1 text-[11px] font-medium rounded-full px-2.5 py-0.5"
              style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
            >
              {statusText}
            </span>
          </div>
        </div>
      </div>

      {expanded && canResume && (
        <ResumePaymentPanel
          orderId={order.id}
          amountKrw={order.amountKrw}
          depositorName={order.depositorName}
          onPaid={() => {
            setExpanded(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
