"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { openPaymentWindow } from "@/lib/openPaymentWindow";

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

const STATUS_KEY: Record<string, string> = {
  PENDING: "statusPending",
  PAID: "statusPaid",
  CANCELLED: "statusCancelled",
  EXPIRED: "statusExpired",
  REFUNDED: "statusRefunded",
};
const STATUS_COLOR: Record<string, string> = {
  PENDING: "var(--yellow)",
  PAID: "var(--green)",
  CANCELLED: "var(--text-dim)",
  EXPIRED: "var(--red)",
  REFUNDED: "var(--blue)",
};

export default function BillingOrderRow({ order }: { order: BillingOrderInfo }) {
  const t = useTranslations("billingOrderRow");
  const tc = useTranslations("common");
  const router = useRouter();
  const [watching, setWatching] = useState(false);
  const canResume = order.status === "PENDING" && !order.preorderWaiting;

  const statusText = order.preorderWaiting ? t("preorderWaiting") : t(STATUS_KEY[order.status]);
  const color = order.preorderWaiting ? "var(--yellow)" : STATUS_COLOR[order.status];

  function resume() {
    openPaymentWindow(order.id);
    setWatching(true);
  }

  useEffect(() => {
    if (!watching) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/orders/${order.id}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === "PAID") {
        clearInterval(interval);
        setWatching(false);
        router.refresh();
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [watching, order.id, router]);

  return (
    <div className="card-glow p-4 animate-fade-up">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{order.titleText}</p>
          <p className="text-xs text-text-dim mt-0.5">
            {order.createdAtText} · {t("depositorLabel")} {order.depositorName}
            {order.discountKrw > 0 && ` · ${t("discountLabel", { amount: order.discountKrw.toLocaleString() })}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canResume && (
            <button
              onClick={resume}
              className="btn-secondary px-3 py-1.5 text-xs active:scale-95 transition-transform"
            >
              {watching ? t("waitingShort") : t("resume")}
            </button>
          )}
          <div className="text-right">
            <p className="font-semibold text-sm">{order.amountKrw.toLocaleString()}{tc("krw")}</p>
            <span
              className="inline-block mt-1 text-[11px] font-medium rounded-full px-2.5 py-0.5"
              style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
            >
              {statusText}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
