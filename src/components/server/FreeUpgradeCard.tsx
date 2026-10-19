"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Cpu, MemoryStick, Archive, HardDrive, RefreshCw } from "lucide-react";
import CountUp from "@/components/CountUp";
import { formatMb } from "@/lib/formatSize";

interface Grant {
  id: string;
  kind: string;
  amount: number;
  expiresAt: string;
}

function grantLabel(g: Grant, t: ReturnType<typeof useTranslations<"freeUpgradeCard">>): string {
  switch (g.kind) {
    case "RAM_UPGRADE": return t("ram", { amount: formatMb(g.amount) });
    case "CPU_UPGRADE": return t("cpu", { amount: g.amount });
    case "DISK_UPGRADE": return t("disk", { amount: formatMb(g.amount) });
    default: return g.kind;
  }
}

interface ShopItem {
  id: string;
  name: string;
  description: string | null;
  kind: "RAM_UPGRADE" | "CPU_UPGRADE" | "DISK_UPGRADE" | "BACKUP_SLOT_UPGRADE" | string;
  pointsCost: number;
  amount: number | null;
}

const RESOURCE_KINDS = new Set(["RAM_UPGRADE", "CPU_UPGRADE", "DISK_UPGRADE", "BACKUP_SLOT_UPGRADE"]);

const KIND_ICON: Record<string, typeof Cpu> = {
  RAM_UPGRADE: MemoryStick,
  CPU_UPGRADE: Cpu,
  DISK_UPGRADE: HardDrive,
  BACKUP_SLOT_UPGRADE: Archive,
};

function defaultLabel(item: ShopItem, t: ReturnType<typeof useTranslations<"freeUpgradeCard">>): string {
  if (!item.amount) return item.name;
  switch (item.kind) {
    case "RAM_UPGRADE": return t("ram", { amount: formatMb(item.amount) });
    case "CPU_UPGRADE": return t("cpu", { amount: item.amount });
    case "DISK_UPGRADE": return t("disk", { amount: formatMb(item.amount) });
    case "BACKUP_SLOT_UPGRADE": return t("backupSlots", { amount: item.amount });
    default: return item.name;
  }
}

export default function FreeUpgradeCard({ serverId }: { serverId: string }) {
  const t = useTranslations("freeUpgradeCard");
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
      .then(setGrants)
      .catch(() => {});
  }

  useEffect(() => {
    fetch("/api/shop")
      .then((r) => r.json())
      .then((data: ShopItem[]) => setItems(data.filter((i) => RESOURCE_KINDS.has(i.kind))));
    fetch("/api/promotions")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setPoints(data.points));
    loadGrants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  async function upgrade(item: ShopItem) {
    setBusy(item.id);
    setError(null);
    setDone(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/free-upgrade`, {
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
      setError(err instanceof Error ? err.message : t("upgradeFailed"));
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
        <h3 className="font-semibold text-sm">{t("title")}</h3>
        <p className="text-xs text-text-dim mt-0.5">
          {t("desc")}{" "}
          <span className="text-accent font-medium"><CountUp value={points} />P</span>
        </p>
      </div>

      {grants.length > 0 && (
        <div className="space-y-1.5">
          {grants.map((g, i) => {
            const daysLeft = Math.max(0, Math.ceil((new Date(g.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
            const urgent = daysLeft <= 3;
            return (
              <div
                key={g.id}
                className="animate-fade-up flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-xs"
                style={{ animationDelay: `${i * 0.03}s` }}
              >
                <span className="text-text-dim">
                  {grantLabel(g, t)} · <span className={urgent ? "text-yellow" : ""}>D-{daysLeft}</span>
                </span>
                <button
                  onClick={() => renew(g.id)}
                  disabled={renewingId !== null}
                  className="text-accent inline-flex items-center gap-1 hover:underline active:scale-95 transition-transform shrink-0"
                >
                  <RefreshCw size={11} className={renewingId === g.id ? "animate-spin" : ""} /> {t("renew")}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-2">
        {items.map((item, i) => {
          const Icon = KIND_ICON[item.kind] ?? Cpu;
          const affordable = points >= item.pointsCost;
          return (
            <button
              key={item.id}
              onClick={() => upgrade(item)}
              disabled={busy !== null || !affordable}
              className="animate-fade-up rounded-xl border border-border bg-surface p-3 flex flex-col items-start gap-1.5 hover:border-accent/40 hover:bg-surface-2 active:scale-[0.97] disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-surface disabled:active:scale-100 transition-all duration-150"
              style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}
            >
              <span className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
                <Icon size={16} className="text-accent" />
              </span>
              <span className="font-medium text-sm">{defaultLabel(item, t)}</span>
              <span className="text-xs text-text-dim">{item.pointsCost.toLocaleString()}P</span>
              {busy === item.id && <span className="text-xs text-text-dim">{t("applying")}</span>}
            </button>
          );
        })}
      </div>
      {done && <p className="text-sm text-green">{t("upgradeComplete")}</p>}
      {error && <p className="text-sm text-red">{error}</p>}
    </div>
  );
}
