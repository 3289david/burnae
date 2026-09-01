"use client";

import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";

interface Snapshot {
  cpuPercent: number;
  ramMb: number;
  diskMb: number;
  recordedAt: string;
}

function Sparkline({ points, max, color, unit }: { points: number[]; max: number; color: string; unit: string }) {
  if (points.length < 2) {
    return <p className="text-xs text-text-dim py-6 text-center">아직 데이터가 쌓이는 중이에요 (10분마다 기록돼요).</p>;
  }
  const w = 100;
  const h = 32;
  const step = w / (points.length - 1);
  const path = points
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${(h - (v / max) * h).toFixed(2)}`)
    .join(" ");
  const area = `${path} L${w},${h} L0,${h} Z`;
  const latest = points[points.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-16 animate-fade-up">
        <path d={area} fill={color} opacity={0.12} />
        <path d={path} fill="none" stroke={color} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="text-[11px] text-text-dim mt-1">최근 {latest.toFixed(0)}{unit} · 최고 {Math.max(...points).toFixed(0)}{unit}</p>
    </div>
  );
}

export default function UsageHistoryChart({
  serverId,
  ramMbLimit,
  cpuPercentLimit,
}: {
  serverId: string;
  ramMbLimit: number;
  cpuPercentLimit: number;
}) {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/servers/${serverId}/usage-history`)
      .then((r) => r.json())
      .then((data) => alive && setSnapshots(data))
      .catch(() => alive && setSnapshots([]));
    return () => {
      alive = false;
    };
  }, [serverId]);

  if (snapshots === null) return null;
  if (snapshots.length === 0) return null;

  return (
    <div className="card-glow p-5 animate-fade-up">
      <h3 className="font-semibold mb-3 flex items-center gap-1.5">
        <TrendingUp size={16} className="text-accent" /> 최근 24시간 사용량
      </h3>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <span className="text-xs text-text-dim">CPU</span>
          <Sparkline points={snapshots.map((s) => s.cpuPercent)} max={Math.max(100, cpuPercentLimit)} color="var(--purple)" unit="%" />
        </div>
        <div>
          <span className="text-xs text-text-dim">RAM</span>
          <Sparkline points={snapshots.map((s) => s.ramMb)} max={ramMbLimit} color="var(--blue)" unit="MB" />
        </div>
      </div>
    </div>
  );
}
