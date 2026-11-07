"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Coins } from "lucide-react";
import SuccessCheck from "@/components/SuccessCheck";
import DepositorNameField from "@/components/DepositorNameField";
import Modal from "@/components/Modal";
import { openPaymentWindow } from "@/lib/openPaymentWindow";

const MIN_POINTS = 100;
const MAX_POINTS = 50_000;
const STEP = 100;
const DEFAULT_POINTS = 2500;

/** 돈으로 포인트를 직접 충전 — 결제 자체는 새 창(openPaymentWindow)에서 진행하고, 여기서는
 * 완료 여부만 폴링해서 반영한다(화면에 입금 안내가 그대로 펼쳐져 있는 게 산만하다는 피드백 반영).
 * 금액은 고정 패키지가 아니라 슬라이더로 직접 고른다(1원=1포인트) — 모달로 따로 띄운다. */
export default function PointsPurchaseCard() {
  const t = useTranslations("pointsPurchaseCard");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState(DEFAULT_POINTS);
  const [depositorName, setDepositorName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<{ orderId: string } | null>(null);
  const [justCharged, setJustCharged] = useState(false);

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/points/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points, depositorName: depositorName || undefined }),
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
        <button onClick={() => setOpen(true)} className="btn-secondary px-3.5 py-1.5 text-xs shrink-0 active:scale-95 transition-transform">
          {t("open")}
        </button>
      </div>

      {justCharged && (
        <div className="animate-toast-in mt-3 pt-3 border-t border-border flex items-center gap-2 text-sm text-green">
          <SuccessCheck size={24} confetti />
          {t("charged")}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)}>
        {!payment ? (
          <div className="space-y-4">
            <p className="font-semibold">{t("title")}</p>
            <div>
              <p className="text-2xl font-bold">
                {points.toLocaleString()}P <span className="text-sm text-text-dim font-normal">· {points.toLocaleString()}{tc("krw")}</span>
              </p>
              <input
                type="range"
                min={MIN_POINTS}
                max={MAX_POINTS}
                step={STEP}
                value={points}
                onChange={(e) => setPoints(Number(e.target.value))}
                className="w-full mt-2"
              />
              <div className="flex justify-between text-xs text-text-dim mt-1">
                <span>{MIN_POINTS.toLocaleString()}P</span>
                <span>{MAX_POINTS.toLocaleString()}P</span>
              </div>
            </div>
            <DepositorNameField value={depositorName} onChange={setDepositorName} />
            <div className="flex gap-2">
              <button onClick={buy} disabled={busy} className="btn-primary px-4 py-2 text-sm flex-1">
                {busy ? tc("checking") : t("open")}
              </button>
              <button onClick={() => setOpen(false)} className="btn-secondary px-4 py-2 text-sm">
                {tc("cancel")}
              </button>
            </div>
            {error && <p className="text-xs text-red">{error}</p>}
          </div>
        ) : (
          <div className="space-y-1.5 text-sm">
            <p className="text-xs text-text-dim flex items-center gap-1.5">
              <span className="animate-pulse">●</span> {t("waiting")}
            </p>
            <button onClick={() => openPaymentWindow(payment.orderId)} className="text-xs text-accent hover:underline">
              {t("reopenWindow")}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
