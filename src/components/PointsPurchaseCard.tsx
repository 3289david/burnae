"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Coins } from "lucide-react";
import SuccessCheck from "@/components/SuccessCheck";
import { openPaymentWindow } from "@/lib/openPaymentWindow";

const PACKAGES = [
  { points: 500, priceKrw: 500 },
  { points: 2500, priceKrw: 2500 },
  { points: 10000, priceKrw: 10000 },
];

/** 돈으로 포인트를 직접 충전 — 결제 자체는 새 창(openPaymentWindow)에서 진행하고, 여기서는
 * 완료 여부만 폴링해서 반영한다(화면에 입금 안내가 그대로 펼쳐져 있는 게 산만하다는 피드백 반영) */
export default function PointsPurchaseCard() {
  const t = useTranslations("pointsPurchaseCard");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<{ orderId: string } | null>(null);
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
      setPayment({ orderId: data.id });
      openPaymentWindow(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("purchaseFailed"));
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
            <p className="text-sm font-medium">{t("title")}</p>
            <p className="text-xs text-text-dim">{t("subtitle")}</p>
          </div>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="btn-secondary px-3.5 py-1.5 text-xs shrink-0 active:scale-95 transition-transform">
          {open ? tc("close") : t("open")}
        </button>
      </div>

      {justCharged && (
        <div className="animate-toast-in mt-3 pt-3 border-t border-border flex items-center gap-2 text-sm text-green">
          <SuccessCheck size={24} confetti />
          {t("charged")}
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
              <p className="text-xs text-text-dim mt-0.5">{pkg.priceKrw.toLocaleString()}{tc("krw")}</p>
            </button>
          ))}
        </div>
      )}

      {payment && (
        <div className="mt-3 pt-3 border-t border-border space-y-1.5 text-sm">
          <p className="text-xs text-text-dim flex items-center gap-1.5">
            <span className="animate-pulse">●</span> {t("waiting")}
          </p>
          <button onClick={() => openPaymentWindow(payment.orderId)} className="text-xs text-accent hover:underline">
            {t("reopenWindow")}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red mt-2">{error}</p>}
    </div>
  );
}
