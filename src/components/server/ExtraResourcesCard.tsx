"use client";

import { useEffect, useState } from "react";
import { Plug, Globe2, RefreshCw } from "lucide-react";
import CountUp from "@/components/CountUp";

interface Grant {
  id: string;
  kind: string;
  amount: number;
  expiresAt: string;
  metadata: { port?: number } | null;
}

function grantLabel(g: Grant): string {
  if (g.kind === "EXTRA_PORT") return `추가 포트${g.metadata?.port ? ` ${g.metadata.port}` : ""}`;
  if (g.kind === "EXTRA_SUBDOMAIN") return "추가 서브도메인 슬롯";
  return g.kind;
}

interface ShopItem {
  id: string;
  name: string;
  description: string | null;
  kind: "EXTRA_PORT" | "EXTRA_SUBDOMAIN" | string;
  pointsCost: number;
  maxTotal: number | null;
}

const EXTRA_KINDS = new Set(["EXTRA_PORT", "EXTRA_SUBDOMAIN"]);

const KIND_ICON: Record<string, typeof Plug> = {
  EXTRA_PORT: Plug,
  EXTRA_SUBDOMAIN: Globe2,
};

export default function ExtraResourcesCard({ serverId }: { serverId: string }) {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [points, setPoints] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [renewingId, setRenewingId] = useState<string | null>(null);

  function loadGrants() {
    fetch(`/api/servers/${serverId}/resource-upgrades`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Grant[]) => setGrants(data.filter((g) => EXTRA_KINDS.has(g.kind))))
      .catch(() => {});
  }

  useEffect(() => {
    fetch("/api/shop")
      .then((r) => r.json())
      .then((data: ShopItem[]) => setItems(data.filter((i) => EXTRA_KINDS.has(i.kind))));
    fetch("/api/promotions")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setPoints(data.points));
    loadGrants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  async function buy(item: ShopItem) {
    setBusy(item.id);
    setError(null);
    setDone(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/extra-resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopItemId: item.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPoints((p) => p - data.pointsSpent);
      setDone(item.id);
      loadGrants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "구매 실패");
    } finally {
      setBusy(null);
    }
  }

  async function renew(grantId: string) {
    setRenewingId(grantId);
    try {
      const res = await fetch(`/api/servers/${serverId}/resource-upgrades/${grantId}/renew`, { method: "POST" });
      if (res.ok) loadGrants();
    } finally {
      setRenewingId(null);
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="card-glow p-5 space-y-3">
      <div>
        <h3 className="font-semibold text-sm">포인트로 추가 포트/서브도메인 구매</h3>
        <p className="text-xs text-text-dim mt-0.5">
          플랜과 무관하게 포인트로 포트나 서브도메인을 추가로 살 수 있어요. 120일간만 유지되고, 만료
          전 갱신하지 않으면 자동으로 회수돼요. 보유 포인트{" "}
          <span className="text-accent font-medium"><CountUp value={points} />P</span>
        </p>
      </div>

      {grants.length > 0 && (
        <div className="space-y-1.5">
          {grants.map((g, i) => {
            const daysLeft = Math.max(0, Math.ceil((new Date(g.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
            const urgent = daysLeft <= 7;
            return (
              <div
                key={g.id}
                className="animate-fade-up flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-xs"
                style={{ animationDelay: `${i * 0.03}s` }}
              >
                <span className="text-text-dim">
                  {grantLabel(g)} · <span className={urgent ? "text-yellow" : ""}>D-{daysLeft}</span>
                </span>
                <button
                  onClick={() => renew(g.id)}
                  disabled={renewingId !== null}
                  className="text-accent inline-flex items-center gap-1 hover:underline active:scale-95 transition-transform shrink-0"
                >
                  <RefreshCw size={11} className={renewingId === g.id ? "animate-spin" : ""} /> 갱신
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-2">
        {items.map((item, i) => {
          const Icon = KIND_ICON[item.kind] ?? Plug;
          const affordable = points >= item.pointsCost;
          return (
            <button
              key={item.id}
              onClick={() => buy(item)}
              disabled={busy !== null || !affordable}
              className="animate-fade-up rounded-xl border border-border bg-surface p-3 flex flex-col items-start gap-1.5 hover:border-accent/40 hover:bg-surface-2 active:scale-[0.97] disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-surface disabled:active:scale-100 transition-all duration-150"
              style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}
            >
              <span className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
                <Icon size={16} className="text-accent" />
              </span>
              <span className="font-medium text-sm">{item.name}</span>
              <span className="text-xs text-text-dim">{item.pointsCost.toLocaleString()}P · 120일</span>
              {busy === item.id && <span className="text-xs text-text-dim">적용 중...</span>}
            </button>
          );
        })}
      </div>
      {done && <p className="text-sm text-green">구매 완료!</p>}
      {error && <p className="text-sm text-red">{error}</p>}
    </div>
  );
}
