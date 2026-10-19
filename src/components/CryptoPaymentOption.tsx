"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { Coins, Copy, Check, ExternalLink } from "lucide-react";

interface CoinOption {
  coin: string;
  label: string;
  rateKrw: number;
  estimatedAmount: number | null;
}

interface CryptoPayment {
  id: string;
  coin: string;
  address: string;
  amountCrypto: string;
  receivedCrypto: string;
  status: string;
  expiresAt: string;
}

const EXPLORER_URL: Record<string, (address: string) => string> = {
  USDT_TRC20: (a) => `https://tronscan.org/#/address/${a}`,
  TRX: (a) => `https://tronscan.org/#/address/${a}`,
  USDT_SOL: (a) => `https://explorer.solana.com/address/${a}`,
  SOL: (a) => `https://explorer.solana.com/address/${a}`,
  BTC: (a) => `https://mempool.space/address/${a}`,
  LTC: (a) => `https://blockchair.com/litecoin/address/${a}`,
};

const STATUS_KEY: Record<string, string> = {
  PENDING: "statusPending",
  DETECTED: "statusDetected",
  CONFIRMING: "statusConfirming",
  UNDERPAID: "statusUnderpaid",
  CONFIRMED: "statusConfirmed",
  EXPIRED: "statusExpired",
  FAILED: "statusFailed",
  MANUAL_REVIEW: "statusManualReview",
};

function useCountdown(expiresAt: string | undefined) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setRemaining(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);
  const min = Math.floor(remaining / 60);
  const sec = remaining % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

/**
 * 주문 하나에 대해 "코인으로 결제하기"를 눌렀을 때 보여주는 전체 흐름 — 코인/네트워크 선택부터
 * 입금 주소+QR 발급, 실시간 상태 확인까지 전부 이 컴포넌트 안에서 처리한다. 계좌이체 안내
 * 화면 옆에 대안으로 붙여 쓰면 된다.
 */
export default function CryptoPaymentOption({
  orderId,
  amountKrw,
  onConfirmed,
}: {
  orderId: string;
  amountKrw: number;
  onConfirmed?: () => void;
}) {
  const t = useTranslations("cryptoPaymentOption");
  const [open, setOpen] = useState(false);
  const [coins, setCoins] = useState<CoinOption[] | null>(null);
  const [payment, setPayment] = useState<CryptoPayment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const countdown = useCountdown(payment?.expiresAt);

  useEffect(() => {
    if (!open || payment) return;
    fetch(`/api/crypto/coins?amountKrw=${amountKrw}`)
      .then((r) => r.json())
      .then(setCoins)
      .catch(() => setCoins([]));
  }, [open, payment, amountKrw]);

  useEffect(() => {
    if (!payment) return;
    QRCode.toDataURL(payment.address, { margin: 1, width: 220 }).then(setQr).catch(() => setQr(null));
  }, [payment]);

  useEffect(() => {
    if (!payment || ["CONFIRMED", "EXPIRED", "FAILED"].includes(payment.status)) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/orders/${orderId}/crypto-payment`);
      if (!res.ok) return;
      const data = await res.json();
      setPayment(data);
      if (data.status === "CONFIRMED") onConfirmed?.();
    }, 5000);
    return () => clearInterval(interval);
  }, [payment, orderId, onConfirmed]);

  async function choose(coin: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/crypto-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPayment(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("createFailed"));
    } finally {
      setBusy(false);
    }
  }

  function copyAddress() {
    if (!payment) return;
    navigator.clipboard.writeText(payment.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full btn-secondary py-2.5 text-sm inline-flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
      >
        <Coins size={15} /> {t("payWithCrypto")}
      </button>
    );
  }

  if (!payment) {
    return (
      <div className="card p-5 space-y-3 animate-fade-up">
        <p className="text-sm font-medium">{t("choosePayment")}</p>
        {coins === null && <p className="text-sm text-text-dim">{t("loading")}</p>}
        {coins?.length === 0 && <p className="text-sm text-text-dim">{t("noneAvailable")}</p>}
        <div className="space-y-2">
          {coins?.map((c) => (
            <button
              key={c.coin}
              onClick={() => choose(c.coin)}
              disabled={busy}
              className="w-full flex items-center justify-between rounded-xl border border-border px-4 py-3 text-sm hover:border-accent transition-colors disabled:opacity-50 active:scale-[0.98]"
            >
              <span className="font-medium">{c.label}</span>
              <span className="text-text-dim font-mono text-xs">
                {c.estimatedAmount != null ? `≈ ${c.estimatedAmount}` : ""}
              </span>
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-red">{error}</p>}
        <button onClick={() => setOpen(false)} className="text-xs text-text-dim hover:underline">
          {t("backToBank")}
        </button>
      </div>
    );
  }

  const explorer = EXPLORER_URL[payment.coin]?.(payment.address);

  return (
    <div className="card p-5 space-y-3 animate-fade-up text-center">
      <p className="text-sm font-medium">{t(STATUS_KEY[payment.status] ?? "statusPending")}</p>

      {payment.status === "PENDING" && (
        <>
          {qr && <img src={qr} alt={t("qrAlt")} className="mx-auto rounded-lg" width={180} height={180} />}
          <div
            onClick={copyAddress}
            className="font-mono text-xs break-all bg-surface-2 rounded-lg px-3 py-2 cursor-pointer hover:bg-surface-2/70 inline-flex items-center gap-1.5"
          >
            {payment.address}
            {copied ? <Check size={13} className="text-green shrink-0" /> : <Copy size={13} className="text-text-dim shrink-0" />}
          </div>
          <p className="text-sm">
            {t("sendAmount")} <strong className="font-mono">{payment.amountCrypto}</strong>
          </p>
          <p className="text-xs text-text-dim">{t("timeRemaining", { time: countdown })}</p>
          <p className="text-xs text-text-dim">{t("autoConfirmHint")}</p>
        </>
      )}

      {payment.status === "UNDERPAID" && (
        <p className="text-sm text-text-dim">
          {t("underpaidMessage", { received: payment.receivedCrypto, amount: payment.amountCrypto })}
        </p>
      )}

      {explorer && (
        <a href={explorer} target="_blank" rel="noopener noreferrer" className="text-xs text-accent inline-flex items-center gap-1 hover:underline">
          {t("viewExplorer")} <ExternalLink size={11} />
        </a>
      )}

      {["EXPIRED", "FAILED"].includes(payment.status) && (
        <button
          onClick={() => {
            setPayment(null);
            setQr(null);
          }}
          className="btn-secondary px-4 py-2 text-sm"
        >
          {t("retry")}
        </button>
      )}
    </div>
  );
}
