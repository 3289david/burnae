"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import SuccessCheck from "@/components/SuccessCheck";
import CountUp from "@/components/CountUp";
import DepositorNameField from "@/components/DepositorNameField";
import Modal from "@/components/Modal";
import { openPaymentWindow } from "@/lib/openPaymentWindow";

/** 20원 = 1크레딧. 고정 패키지 대신 슬라이더로 직접 수량을 고른다 */
const KRW_PER_CREDIT = 20;
const MIN_CREDITS = 50;
const MAX_CREDITS = 5_000;
const STEP = 50;
const DEFAULT_CREDITS = 500;

export default function AiCreditsCard() {
  const t = useTranslations("aiCreditsCard");
  const tc = useTranslations("common");
  const [credits, setCredits] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(DEFAULT_CREDITS);
  const [depositorName, setDepositorName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<{ orderId: string } | null>(null);
  const [justCharged, setJustCharged] = useState(false);

  function loadBalance() {
    fetch("/api/ai-credits/balance")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setCredits(data.credits));
  }
  useEffect(loadBalance, []);

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-credits/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credits: amount, depositorName: depositorName || undefined }),
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
            <p className="text-sm font-medium">{t("title")}</p>
            <p className="text-xs text-text-dim">
              {t("subtitlePrefix")}{" "}
              {credits === null ? "-" : <CountUp value={credits} format={(n) => n.toLocaleString("en-US", { maximumFractionDigits: 2 })} />} {t("subtitleSuffix")}
              <span className="ml-2 text-[11px] text-text-dim/80">(기본 챗 무료)</span>
            </p>
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
                {amount.toLocaleString()}{t("creditsUnit")}{" "}
                <span className="text-sm text-text-dim font-normal">· {(amount * KRW_PER_CREDIT).toLocaleString()}{tc("krw")}</span>
              </p>
              <input
                type="range"
                min={MIN_CREDITS}
                max={MAX_CREDITS}
                step={STEP}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full mt-2"
              />
              <div className="flex justify-between text-xs text-text-dim mt-1">
                <span>{MIN_CREDITS.toLocaleString()}{t("creditsUnit")}</span>
                <span>{MAX_CREDITS.toLocaleString()}{t("creditsUnit")}</span>
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
