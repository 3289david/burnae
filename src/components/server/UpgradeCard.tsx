"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import SuccessCheck from "@/components/SuccessCheck";
import { formatMb } from "@/lib/formatSize";

interface Product {
  id: string;
  name: string;
  ramMb: number;
  diskMb: number;
  priceMonthlyKrw: number;
  pointsRedeemable: boolean;
  pointsCost: number | null;
}
interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

export default function UpgradeCard({ serverId, currentProductId }: { serverId: string; currentProductId: string | null }) {
  const t = useTranslations("upgradeCard");
  const tc = useTranslations("common");
  const [products, setProducts] = useState<Product[]>([]);
  const [points, setPoints] = useState(0);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<{ orderId: string; amountKrw: number; depositorName: string } | null>(null);
  const [bank, setBank] = useState<BankAccount | null>(null);
  const [applied, setApplied] = useState<{ pointsSpent?: number } | null>(null);

  useEffect(() => {
    fetch("/api/catalog/products")
      .then((r) => r.json())
      .then((data: Product[]) => setProducts(data.filter((p) => p.id !== currentProductId)));
    fetch("/api/promotions")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setPoints(data.points));
  }, [currentProductId]);

  const selectedProduct = products.find((p) => p.id === selected);
  const canUsePoints = !!selectedProduct?.pointsRedeemable && selectedProduct.pointsCost != null;
  const canAffordPoints = canUsePoints && points >= (selectedProduct!.pointsCost ?? Infinity);

  async function submit(usePoints: boolean) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/upgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: selected, usePoints: usePoints || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.requiresPayment) {
        setPayment({
          orderId: data.order.id,
          amountKrw: data.order.amountKrw,
          depositorName: data.order.depositorName,
        });
        const bankRes = await fetch("/api/payment/bank-account");
        if (bankRes.ok) setBank(await bankRes.json());
      } else {
        setApplied({ pointsSpent: data.pointsSpent });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("processFailed"));
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
        setApplied({});
        setPayment(null);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [payment]);

  if (applied) {
    return (
      <div className="card-glow p-5 flex items-center gap-3 animate-fade-up">
        <SuccessCheck size={40} confetti className="shrink-0" />
        <p className="text-sm text-green">
          {t("changedMessage", {
            pointsNote: applied.pointsSpent ? t("pointsUsedNote", { amount: applied.pointsSpent.toLocaleString() }) : "",
          })}
        </p>
      </div>
    );
  }

  if (payment) {
    return (
      <div className="card-glow p-5 space-y-2 animate-fade-up">
        <h3 className="font-semibold text-sm">{t("balanceTitle")}</h3>
        {bank && (
          <p className="text-sm">{bank.bankName} {bank.accountNumber} ({bank.accountHolder})</p>
        )}
        <p className="text-sm">{t("depositorLabel")} <strong className="text-accent">{payment.depositorName}</strong></p>
        <p className="text-sm">{t("amountLabel")} <strong className="text-accent">{payment.amountKrw.toLocaleString()}{tc("krw")}</strong></p>
        <p className="text-xs text-text-dim">{t("autoApplyHint")}</p>
      </div>
    );
  }

  return (
    <div className="card-glow p-5 space-y-3">
      <h3 className="font-semibold text-sm">{t("title")}</h3>
      <div className="flex gap-2">
        <select className="input flex-1 min-w-0" value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">{t("selectPlan")}</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — RAM {formatMb(p.ramMb)} · {p.priceMonthlyKrw.toLocaleString()}{tc("krw")}{t("perMonth")}
              {p.pointsRedeemable && p.pointsCost != null ? t("pointsOptionSuffix", { amount: p.pointsCost.toLocaleString() }) : ""}
            </option>
          ))}
        </select>
        <button onClick={() => submit(false)} disabled={busy || !selected} className="btn-primary px-4 py-2 text-sm shrink-0 active:scale-95 transition-transform">
          {t("change")}
        </button>
      </div>
      {canUsePoints && (
        <button
          onClick={() => submit(true)}
          disabled={busy || !canAffordPoints}
          className="btn-secondary w-full py-2 text-sm active:scale-[0.98] transition-transform"
        >
          {canAffordPoints
            ? t("changeWithPoints", { cost: selectedProduct!.pointsCost!.toLocaleString(), balance: points.toLocaleString() })
            : t("insufficientPoints", { cost: selectedProduct!.pointsCost!.toLocaleString(), balance: points.toLocaleString() })}
        </button>
      )}
      <p className="text-xs text-text-dim">{t("footerHint")}</p>
      {error && <p className="text-sm text-red">{error}</p>}
    </div>
  );
}
