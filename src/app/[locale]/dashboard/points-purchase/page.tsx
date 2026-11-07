"use client";

import { useEffect, useState } from "react";
import CryptoPaymentOption from "@/components/CryptoPaymentOption";
import SuccessCheck from "@/components/SuccessCheck";
import BrandMark from "@/components/BrandMark";
import DepositorNameField from "@/components/DepositorNameField";

const MIN_POINTS = 100;
const MAX_POINTS = 50_000;
const STEP = 100;
const DEFAULT_POINTS = 2500;

/**
 * PointsPurchaseCard의 "충전" 버튼이 새 탭으로 여는 전용 페이지 — 모달이 아니라 완전히 분리된
 * 탭에서 진행한다(결제 흐름이 섞이지 않게). 금액은 슬라이더로 직접 고른다(1원=1포인트).
 */
export default function PointsPurchasePage() {
  const [points, setPoints] = useState(DEFAULT_POINTS);
  const [depositorName, setDepositorName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<{ id: string; amountKrw: number; depositorName: string; status: string } | null>(null);
  const [bank, setBank] = useState<{ bankName: string; accountNumber: string; accountHolder: string } | null>(null);
  const [cryptoOpen, setCryptoOpen] = useState(false);
  const [depositorEdit, setDepositorEdit] = useState("");
  const [depositorEditBusy, setDepositorEditBusy] = useState(false);
  const [depositorEditError, setDepositorEditError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

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
        setPaid(true);
        return;
      }
      setOrder(data);
      setDepositorEdit(data.depositorName);
      const bankRes = await fetch("/api/payment/bank-account");
      if (bankRes.ok) setBank(await bankRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "충전에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function updateDepositorName() {
    if (!order || !depositorEdit) return;
    setDepositorEditBusy(true);
    setDepositorEditError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositorName: depositorEdit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "변경에 실패했어요.");
      setOrder({ ...order, depositorName: data.depositorName });
    } catch (err) {
      setDepositorEditError(err instanceof Error ? err.message : "변경에 실패했어요.");
    } finally {
      setDepositorEditBusy(false);
    }
  }

  useEffect(() => {
    if (!order || paid) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/orders/${order.id}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === "PAID") {
        clearInterval(interval);
        setPaid(true);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [order, paid]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="flex items-center gap-2 text-lg font-bold font-display justify-center mb-6">
          <BrandMark /> Burnae
        </div>

        {paid ? (
          <div className="card-glow p-8 text-center space-y-4">
            <SuccessCheck size={48} confetti />
            <p className="font-semibold">충전이 완료됐어요!</p>
            <button onClick={() => window.close()} className="btn-primary px-5 py-2.5 text-sm">
              창 닫기
            </button>
          </div>
        ) : !order ? (
          <div className="card-glow p-6 space-y-4">
            <p className="font-semibold">포인트 충전</p>
            <div>
              <p className="text-2xl font-bold">
                {points.toLocaleString()}P <span className="text-sm text-text-dim font-normal">· {points.toLocaleString()}원</span>
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
            {error && <p className="text-xs text-red">{error}</p>}
            <button onClick={buy} disabled={busy} className="btn-primary w-full px-4 py-2.5 text-sm">
              {busy ? "처리 중..." : "충전하기"}
            </button>
          </div>
        ) : (
          <>
            <div className="card-glow p-6 space-y-3">
              {bank && (
                <>
                  <Row label="은행" value={bank.bankName} />
                  <Row label="계좌번호" value={bank.accountNumber} />
                  <Row label="예금주" value={bank.accountHolder} />
                </>
              )}
              <Row label="입금자명" value={order.depositorName} highlight />
              <Row label="입금 금액" value={`${order.amountKrw.toLocaleString()}원`} highlight />
              <p className="text-xs text-text-dim pt-2">이름·금액이 정확히 일치해야 확인돼요.</p>
              <div className="flex items-center gap-2 text-sm text-text-dim pt-2">
                <span className="animate-pulse">●</span> 입금 확인 대기 중...
              </div>
            </div>

            <button
              onClick={() => setCryptoOpen((v) => !v)}
              className="btn-secondary w-full mt-3 py-2.5 text-sm flex items-center justify-center gap-1.5"
            >
              코인으로 결제하기 {cryptoOpen ? "▲" : "▼"}
            </button>
            {cryptoOpen && (
              <div className="card mt-2 p-4">
                <CryptoPaymentOption orderId={order.id} amountKrw={order.amountKrw} />
              </div>
            )}

            <div className="card mt-3 p-5">
              <label className="text-sm text-text-dim">입금자명 바꾸기</label>
              <div className="flex gap-2 mt-1.5">
                <input
                  className="input flex-1"
                  maxLength={5}
                  value={depositorEdit}
                  onChange={(e) => setDepositorEdit(e.target.value.replace(/\s+/g, ""))}
                />
                <button
                  onClick={updateDepositorName}
                  disabled={depositorEditBusy || !depositorEdit || depositorEdit === order.depositorName}
                  className="btn-secondary px-4 text-sm shrink-0"
                >
                  변경
                </button>
              </div>
              {depositorEditError && <p className="text-xs text-red mt-1.5">{depositorEditError}</p>}
            </div>
          </>
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
