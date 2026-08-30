"use client";

import { useEffect, useState } from "react";
import { Cpu, MemoryStick, Archive, HardDrive } from "lucide-react";
import CountUp from "@/components/CountUp";

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

function defaultLabel(item: ShopItem): string {
  if (!item.amount) return item.name;
  switch (item.kind) {
    case "RAM_UPGRADE": return `RAM +${(item.amount / 1024).toFixed(1)}GB`;
    case "CPU_UPGRADE": return `CPU +${item.amount}%`;
    case "DISK_UPGRADE": return `저장공간 +${(item.amount / 1024).toFixed(1)}GB`;
    case "BACKUP_SLOT_UPGRADE": return `백업 슬롯 +${item.amount}개`;
    default: return item.name;
  }
}

export default function FreeUpgradeCard({ serverId }: { serverId: string }) {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [points, setPoints] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/shop")
      .then((r) => r.json())
      .then((data: ShopItem[]) => setItems(data.filter((i) => RESOURCE_KINDS.has(i.kind))));
    fetch("/api/promotions")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setPoints(data.points));
  }, []);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "증설 실패");
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="card-glow p-5 space-y-3">
      <div>
        <h3 className="font-semibold text-sm">포인트로 증설하기</h3>
        <p className="text-xs text-text-dim mt-0.5">
          무료 서버는 플랜을 통째로 바꾸지 않아도 포인트로 램/CPU/저장공간/백업 슬롯을 낱개로 늘릴 수
          있어요. 보유 포인트 <span className="text-accent font-medium"><CountUp value={points} />P</span>
        </p>
      </div>
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
              <span className="font-medium text-sm">{defaultLabel(item)}</span>
              <span className="text-xs text-text-dim">{item.pointsCost.toLocaleString()}P</span>
              {busy === item.id && <span className="text-xs text-text-dim">적용 중...</span>}
            </button>
          );
        })}
      </div>
      {done && <p className="text-sm text-green">증설 완료! 적용을 위해 서버가 재시작돼요.</p>}
      {error && <p className="text-sm text-red">{error}</p>}
    </div>
  );
}
