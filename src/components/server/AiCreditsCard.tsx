"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import SuccessCheck from "@/components/SuccessCheck";
import CountUp from "@/components/CountUp";
import DepositorNameField from "@/components/DepositorNameField";
import { openPaymentWindow } from "@/lib/openPaymentWindow";

/** 40원 = 1크레딧 */
const PACKAGES = [
  { credits: 100, priceKrw: 4000 },
  { credits: 500, priceKrw: 20000 },
  { credits: 1500, priceKrw: 60000 },
];

export default function AiCreditsCard() {
  const t = useTranslations("aiCreditsCard");
  const tc = useTranslations("common");
  const [credits, setCredits] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<(typeof PACKAGES)[number] | null>(null);
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
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-credits/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credits: selected.credits, depositorName: depositorName || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.status === "PAID") {
        loadBalance();
        setOpen(false);
        setSelected(null);
        setJustCharged(true);
        setTimeout(() => setJustCharged(false), 3000);
        return;
      }
      setPayment({ orderId: data.id });
      setSelected(null);
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
            </p>
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

      {open && !payment && !selected && (
        <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 gap-2">
          {PACKAGES.map((pkg, i) => (
            <button
              key={pkg.credits}
              onClick={() => setSelected(pkg)}
              className="rounded-xl border border-border bg-surface p-3 text-center hover:border-accent/40 hover:bg-surface-2 transition-all duration-150 active:scale-95 animate-fade-up"
              style={{ animationDelay: `${i * 0.04}s` }}
            >
              <p className="font-semibold text-sm">{pkg.credits.toLocaleString()}{t("creditsUnit")}</p>
              <p className="text-xs text-text-dim mt-0.5">{pkg.priceKrw.toLocaleString()}{tc("krw")}</p>
            </button>
          ))}
        </div>
      )}

      {open && !payment && selected && (
        <div className="mt-3 pt-3 border-t border-border space-y-3">
          <p className="text-sm">
            {selected.credits.toLocaleString()}{t("creditsUnit")} · {selected.priceKrw.toLocaleString()}{tc("krw")}
          </p>
          <DepositorNameField value={depositorName} onChange={setDepositorName} />
          <div className="flex gap-2">
            <button onClick={buy} disabled={busy} className="btn-primary px-4 py-2 text-sm flex-1">
              {busy ? tc("checking") : t("open")}
            </button>
            <button onClick={() => setSelected(null)} className="btn-secondary px-4 py-2 text-sm">
              {tc("cancel")}
            </button>
          </div>
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
