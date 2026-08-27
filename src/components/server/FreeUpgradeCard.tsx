"use client";

import { useEffect, useState } from "react";
import { Cpu, MemoryStick, Archive } from "lucide-react";

const RESOURCES = [
  { key: "ram", label: "RAM +0.5GB", pointsCost: 300, icon: MemoryStick },
  { key: "cpu", label: "CPU +25%", pointsCost: 250, icon: Cpu },
  { key: "backupSlot", label: "백업 슬롯 +1개", pointsCost: 400, icon: Archive },
] as const;

export default function FreeUpgradeCard({ serverId }: { serverId: string }) {
  const [points, setPoints] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/promotions")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setPoints(data.points));
  }, []);

  async function upgrade(resource: string) {
    setBusy(resource);
    setError(null);
    setDone(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/free-upgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPoints((p) => p - data.pointsSpent);
      setDone(resource);
    } catch (err) {
      setError(err instanceof Error ? err.message : "증설 실패");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card-glow p-5 space-y-3">
      <div>
        <h3 className="font-semibold text-sm">포인트로 증설하기</h3>
        <p className="text-xs text-text-dim mt-0.5">
          무료 서버는 플랜을 통째로 바꾸지 않아도 포인트로 램/CPU/백업 슬롯을 낱개로 늘릴 수 있어요. 보유 포인트{" "}
          <span className="text-accent font-medium">{points.toLocaleString()}P</span>
        </p>
      </div>
      <div className="grid sm:grid-cols-3 gap-2">
        {RESOURCES.map((r) => {
          const Icon = r.icon;
          const affordable = points >= r.pointsCost;
          return (
            <button
              key={r.key}
              onClick={() => upgrade(r.key)}
              disabled={busy !== null || !affordable}
              className="rounded-xl border border-border bg-surface p-3 flex flex-col items-start gap-1.5 hover:border-accent/40 hover:bg-surface-2 disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-surface transition-all duration-150"
            >
              <span className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
                <Icon size={16} className="text-accent" />
              </span>
              <span className="font-medium text-sm">{r.label}</span>
              <span className="text-xs text-text-dim">{r.pointsCost.toLocaleString()}P</span>
              {busy === r.key && <span className="text-xs text-text-dim">적용 중...</span>}
            </button>
          );
        })}
      </div>
      {done && <p className="text-sm text-green">증설 완료! 적용을 위해 서버가 재시작돼요.</p>}
      {error && <p className="text-sm text-red">{error}</p>}
    </div>
  );
}
