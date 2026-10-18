"use client";

import { useEffect, useState } from "react";
import Toggle from "@/components/Toggle";

interface WalletConfig {
  coin: string;
  xpub: string | null;
  addressPool: { address: string; used: boolean }[];
  confirmationsRequired: number;
  enabled: boolean;
  nextDerivationIndex: number;
}

interface PaymentRow {
  id: string;
  coin: string;
  address: string;
  amountCrypto: string;
  receivedCrypto: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  reviewNote: string | null;
  order: {
    id: string;
    amountKrw: number;
    productNameSnapshot: string | null;
    serverNameRequested: string | null;
    user: { name: string; email: string };
  };
}

const COIN_META: Record<string, { label: string; kind: "xpub" | "pool"; help: string }> = {
  USDT_TRC20: {
    label: "USDT (TRC20)",
    kind: "xpub",
    help: "TRON(secp256k1) 확장 공개키(xpub) — 공개키만으로 입금 주소를 자동으로 여러 개 만들 수 있어요. 개인키/시드구문은 절대 여기 넣지 마세요.",
  },
  TRX: {
    label: "TRON (TRX)",
    kind: "xpub",
    help: "USDT(TRC20)과 같은 xpub을 그대로 써도 돼요(같은 TRON 주소 체계).",
  },
  USDT_SOL: {
    label: "USDT (Solana)",
    kind: "pool",
    help: "Solana는 공개키만으로 자식 주소를 못 만들어서, 오프라인에서 미리 만들어둔 받기 전용 주소를 한 줄에 하나씩 붙여넣어 등록해두세요.",
  },
  SOL: { label: "Solana (SOL)", kind: "pool", help: "USDT(Solana)와 같은 주소 목록을 공유해도 되고 따로 둬도 돼요." },
  BTC: {
    label: "Bitcoin (BTC)",
    kind: "xpub",
    help: "BIP32 확장 공개키(네이티브 세그윗 계정, m/84'/0'/0' 기준 xpub) — 공개키만으로 bc1... 주소를 자동으로 여러 개 만들어요.",
  },
  LTC: {
    label: "Litecoin (LTC)",
    kind: "xpub",
    help: "BIP32 확장 공개키(표준 xpub 형식) — 공개키만으로 ltc1... 주소를 자동으로 여러 개 만들어요. Ltub/Mtub 형식은 아직 지원하지 않아요.",
  },
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "대기",
  DETECTED: "감지됨",
  CONFIRMING: "확인 중",
  UNDERPAID: "부족 입금",
  CONFIRMED: "확정",
  EXPIRED: "만료",
  FAILED: "실패",
  MANUAL_REVIEW: "검토 필요",
};

export default function AdminCryptoPage() {
  const [wallets, setWallets] = useState<WalletConfig[] | null>(null);
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { xpub: string; addressPoolText: string; confirmationsRequired: number }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<string>("");

  async function loadWallets() {
    const res = await fetch("/api/admin/crypto/wallets");
    if (!res.ok) return;
    const data: WalletConfig[] = await res.json();
    setWallets(data);
    setDrafts(
      Object.fromEntries(
        data.map((w) => [w.coin, { xpub: w.xpub ?? "", addressPoolText: "", confirmationsRequired: w.confirmationsRequired }]),
      ),
    );
  }

  async function loadPayments() {
    const res = await fetch(`/api/admin/crypto/payments${filter ? `?status=${filter}` : ""}`);
    if (res.ok) setPayments(await res.json());
  }

  useEffect(() => {
    loadWallets();
  }, []);

  useEffect(() => {
    loadPayments();
    const interval = setInterval(loadPayments, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function saveWallet(coin: string, patch: Partial<{ enabled: boolean }>) {
    setSaving(coin);
    setErrors((prev) => ({ ...prev, [coin]: "" }));
    try {
      const draft = drafts[coin];
      const res = await fetch("/api/admin/crypto/wallets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coin,
          xpub: draft?.xpub || undefined,
          addressPoolText: draft?.addressPoolText || undefined,
          confirmationsRequired: draft?.confirmationsRequired,
          ...patch,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setErrors((prev) => ({ ...prev, [coin]: body?.error ?? `저장 실패 (${res.status})` }));
        return;
      }
      await loadWallets();
    } catch {
      setErrors((prev) => ({ ...prev, [coin]: "네트워크 오류로 저장하지 못했어요." }));
    } finally {
      setSaving(null);
    }
  }

  async function review(id: string, decision: "APPROVE" | "REJECT") {
    const note = prompt(decision === "APPROVE" ? "승인 메모(선택)" : "거절 사유(선택)") ?? undefined;
    await fetch(`/api/admin/crypto/payments/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note }),
    });
    await loadPayments();
  }

  if (!wallets) return <p className="text-text-dim text-sm">불러오는 중...</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">코인 결제</h1>
        <p className="text-sm text-text-dim mt-1">
          여기서는 공개키/주소만 등록해요 — 개인키나 시드 구문은 절대 입력하지 않아요. 자금 인출은
          오프라인에 보관한 개인키로 직접 하세요.
        </p>
      </div>

      <div className="space-y-4">
        {wallets.map((w) => {
          const meta = COIN_META[w.coin];
          const draft = drafts[w.coin] ?? { xpub: "", addressPoolText: "", confirmationsRequired: 1 };
          return (
            <div key={w.coin} className="card-glow p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{meta?.label ?? w.coin}</h3>
                  <p className="text-xs text-text-dim mt-0.5">{meta?.help}</p>
                </div>
                <Toggle checked={w.enabled} onChange={(next) => saveWallet(w.coin, { enabled: next })} />
              </div>

              {meta?.kind === "xpub" ? (
                <div>
                  <label className="text-xs text-text-dim">확장 공개키 (xpub)</label>
                  <input
                    className="input w-full mt-1 font-mono text-xs"
                    placeholder="xpub6..."
                    value={draft.xpub}
                    onChange={(e) => setDrafts({ ...drafts, [w.coin]: { ...draft, xpub: e.target.value } })}
                  />
                  <p className="text-xs text-text-dim mt-1">다음 발급 인덱스: {w.nextDerivationIndex}개 주소 이미 사용됨</p>
                </div>
              ) : (
                <div>
                  <label className="text-xs text-text-dim">
                    받기 전용 주소 목록 (한 줄에 하나씩 추가 — 기존 목록에 이어 붙여요)
                  </label>
                  <textarea
                    className="input w-full mt-1 font-mono text-xs"
                    rows={3}
                    placeholder={"주소1\n주소2"}
                    value={draft.addressPoolText}
                    onChange={(e) => setDrafts({ ...drafts, [w.coin]: { ...draft, addressPoolText: e.target.value } })}
                  />
                  <p className="text-xs text-text-dim mt-1">
                    등록됨 {w.addressPool.length}개 (미사용 {w.addressPool.filter((p) => !p.used).length}개)
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <label className="text-xs text-text-dim shrink-0">필요 확인 수</label>
                <input
                  type="number"
                  min={1}
                  className="input w-20 text-sm"
                  value={draft.confirmationsRequired}
                  onChange={(e) =>
                    setDrafts({ ...drafts, [w.coin]: { ...draft, confirmationsRequired: Number(e.target.value) } })
                  }
                />
                <button
                  onClick={() => saveWallet(w.coin, {})}
                  disabled={saving === w.coin}
                  className="btn-secondary px-3.5 py-1.5 text-xs ml-auto"
                >
                  {saving === w.coin ? "저장 중..." : "저장"}
                </button>
              </div>
              {errors[w.coin] && <p className="text-xs text-red">{errors[w.coin]}</p>}
            </div>
          );
        })}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold">결제 내역</h2>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="input text-sm py-1.5">
            <option value="">전체</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          {payments?.map((p) => (
            <div key={p.id} className="card-glow p-4 flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium">
                  {COIN_META[p.coin]?.label ?? p.coin} · {STATUS_LABEL[p.status] ?? p.status}
                </p>
                <p className="text-xs text-text-dim mt-0.5 truncate">
                  {p.order.user.name}({p.order.user.email}) · {p.order.productNameSnapshot ?? p.order.serverNameRequested ?? "-"} ·{" "}
                  {p.order.amountKrw.toLocaleString()}원 · {p.receivedCrypto}/{p.amountCrypto} 입금
                </p>
                <p className="text-xs text-text-dim font-mono mt-0.5 truncate">{p.address}</p>
              </div>
              {["UNDERPAID", "MANUAL_REVIEW"].includes(p.status) && (
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => review(p.id, "APPROVE")} className="btn-secondary px-3 py-1.5 text-xs text-green">
                    승인
                  </button>
                  <button onClick={() => review(p.id, "REJECT")} className="btn-secondary px-3 py-1.5 text-xs text-red">
                    거절
                  </button>
                </div>
              )}
            </div>
          ))}
          {payments?.length === 0 && <p className="text-sm text-text-dim">결제 내역이 없어요.</p>}
        </div>
      </div>
    </div>
  );
}
