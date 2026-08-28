"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Ban, Clock, Play, Square, RotateCw, Gauge, Cpu, MemoryStick, HardDrive } from "lucide-react";
import type { ServerInfo } from "./ServerDetailClient";
import StatusDot from "@/components/StatusDot";
import AddressActions from "./AddressActions";
import CustomDomainCard from "./CustomDomainCard";
import FreeUpgradeCard from "./FreeUpgradeCard";
import FreeTierAd from "@/components/ads/FreeTierAd";
import GoogleAdSense from "@/components/ads/GoogleAdSense";

interface Resources {
  current_state: string;
  resources: {
    memory_bytes: number;
    cpu_absolute: number;
    disk_bytes: number;
    uptime: number;
  };
}

const stateLabel: Record<string, { text: string; dot: "green" | "yellow" | "red" }> = {
  running: { text: "온라인", dot: "green" },
  starting: { text: "시작 중", dot: "yellow" },
  stopping: { text: "정지 중", dot: "yellow" },
  offline: { text: "오프라인", dot: "red" },
};

export default function OverviewTab({ server }: { server: ServerInfo }) {
  const [resources, setResources] = useState<Resources | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [subdomains, setSubdomains] = useState(server.subdomains);
  const [newName, setNewName] = useState("");
  const [subError, setSubError] = useState<string | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [renewError, setRenewError] = useState<string | null>(null);
  const [renewRequested, setRenewRequested] = useState(false);

  useEffect(() => {
    let stopped = false;
    async function poll() {
      try {
        const res = await fetch(`/api/servers/${server.id}/resources`);
        if (res.ok && !stopped) setResources(await res.json());
      } catch {
        // 폴링 실패는 조용히 무시하고 다음 주기에 재시도
      }
    }
    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [server.id]);

  async function addSubdomain(e: React.FormEvent) {
    e.preventDefault();
    setSubError(null);
    setSubLoading(true);
    try {
      const res = await fetch(`/api/servers/${server.id}/subdomains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSubdomains((prev) => [...prev, data]);
      setNewName("");
    } catch (err) {
      setSubError(err instanceof Error ? err.message : "추가 실패");
    } finally {
      setSubLoading(false);
    }
  }

  async function removeSubdomain(id: string) {
    if (!confirm("이 주소를 삭제할까요?")) return;
    await fetch(`/api/servers/${server.id}/subdomains/${id}`, { method: "DELETE" });
    setSubdomains((prev) => prev.filter((s) => s.id !== id));
  }

  async function renew() {
    setRenewing(true);
    setRenewError(null);
    try {
      const path = server.isFreeServer ? "renew-free" : "renew";
      const res = await fetch(`/api/servers/${server.id}/${path}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRenewRequested(true);
    } catch (err) {
      setRenewError(err instanceof Error ? err.message : "갱신 요청 실패");
    } finally {
      setRenewing(false);
    }
  }

  async function power(signal: "start" | "stop" | "restart") {
    setActionLoading(true);
    try {
      await fetch(`/api/servers/${server.id}/power`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signal }),
      });
    } finally {
      setActionLoading(false);
    }
  }

  const daysLeft = server.renewalDueAt
    ? Math.ceil((new Date(server.renewalDueAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null;
  const renewalWarningDays = server.isFreeServer ? 3 : 7;
  const showRenewal =
    server.isOwner && (server.status === "SUSPENDED" || (daysLeft !== null && daysLeft <= renewalWarningDays));

  return (
    <div className="space-y-6">
      {showRenewal && (
        <div className="card p-4 border-yellow">
          {renewRequested ? (
            <p className="text-sm text-green flex items-center gap-1.5">
              <CheckCircle2 size={16} />
              {server.isFreeServer
                ? "7일 연장했어요."
                : "갱신 결제 안내를 만들었어요. 결제 내역 페이지에서 입금 정보를 확인하세요."}
            </p>
          ) : (
            <>
              <p className="text-sm flex items-center gap-1.5">
                {server.status === "SUSPENDED" ? (
                  <><Ban size={16} className="text-red shrink-0" /> 만료로 서버가 정지됐어요. 갱신하지 않으면 곧 삭제돼요.</>
                ) : server.isFreeServer ? (
                  <><Clock size={16} className="text-yellow shrink-0" /> 무료 서버는 7일마다 갱신이 필요해요 — {daysLeft}일 남았어요.</>
                ) : (
                  <><Clock size={16} className="text-yellow shrink-0" /> 다음 결제일이 {daysLeft}일 남았어요.</>
                )}
              </p>
              <button onClick={renew} disabled={renewing} className="btn-primary px-4 py-1.5 text-sm mt-2">
                {renewing ? "처리 중..." : server.isFreeServer ? "지금 7일 연장하기" : "지금 갱신하기"}
              </button>
              {renewError && <p className="text-xs text-red mt-1">{renewError}</p>}
            </>
          )}
        </div>
      )}

      <div className="flex gap-2.5 animate-fade-up">
        <button
          disabled={actionLoading}
          onClick={() => power("start")}
          className="flex-1 sm:flex-none rounded-2xl px-5 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-1.5 bg-green/15 text-green hover:bg-green/25 transition-colors disabled:opacity-50"
        >
          <Play size={15} /> 시작
        </button>
        <button
          disabled={actionLoading}
          onClick={() => power("restart")}
          className="flex-1 sm:flex-none rounded-2xl px-5 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-1.5 bg-yellow/15 text-yellow hover:bg-yellow/25 transition-colors disabled:opacity-50"
        >
          <RotateCw size={15} /> 재시작
        </button>
        <button
          disabled={actionLoading}
          onClick={() => power("stop")}
          className="flex-1 sm:flex-none rounded-2xl px-5 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-1.5 bg-red/15 text-red hover:bg-red/25 transition-colors disabled:opacity-50"
        >
          <Square size={15} /> 중지
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat
          icon={Gauge}
          color="var(--accent)"
          label="상태"
          value={
            resources ? (
              <span className="inline-flex items-center gap-1.5">
                <StatusDot color={stateLabel[resources.current_state]?.dot ?? "gray"} />
                {stateLabel[resources.current_state]?.text ?? resources.current_state}
              </span>
            ) : (
              "확인 중..."
            )
          }
        />
        <Stat
          icon={MemoryStick}
          color="var(--blue)"
          label="RAM"
          value={resources ? `${(resources.resources.memory_bytes / 1024 / 1024).toFixed(0)}MB / ${(server.ramMb / 1024).toFixed(0)}GB` : "-"}
        />
        <Stat icon={Cpu} color="var(--purple)" label="CPU" value={resources ? `${resources.resources.cpu_absolute.toFixed(0)}%` : "-"} />
        <Stat icon={Clock} color="var(--cyan)" label="가동시간" value={resources ? formatUptime(resources.resources.uptime) : "-"} />
      </div>

      {/* 이 서버의 디스크 사용량 (전체 계정 저장공간 한도와는 별개) */}
      <div className="card-glow p-5 flex items-center gap-4 animate-fade-up">
        <span className="w-11 h-11 rounded-2xl bg-lime/15 flex items-center justify-center shrink-0">
          <HardDrive size={20} className="text-lime" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium">이 서버 디스크</span>
            <span className="text-sm text-text-dim shrink-0">
              {resources ? `${(resources.resources.disk_bytes / 1024 / 1024 / 1024).toFixed(1)}GB` : "-"} / {(server.diskMb / 1024).toFixed(0)}GB
            </span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-surface-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: resources
                  ? `${Math.min(100, (resources.resources.disk_bytes / 1024 / 1024 / 1024 / (server.diskMb / 1024)) * 100)}%`
                  : "0%",
                background: "linear-gradient(90deg, var(--lime), var(--cyan))",
              }}
            />
          </div>
        </div>
      </div>

      <div className="card-glow p-5">
        <h3 className="font-semibold mb-3">서버 정보</h3>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <span className="text-text-dim">종류</span>
          <span>{server.templateName}{server.minecraftVersion && ` · ${server.minecraftVersion}`}</span>
          <span className="text-text-dim">RAM / 디스크</span>
          <span>{(server.ramMb / 1024).toFixed(0)}GB / {(server.diskMb / 1024).toFixed(0)}GB</span>
          <span className="text-text-dim">백업 슬롯</span>
          <span>{server.backupSlots}개</span>
          {server.accessSecret && (
            <>
              <span className="text-text-dim">접속 비밀번호</span>
              <span className="font-mono select-all">{server.accessSecret}</span>
            </>
          )}
        </div>
      </div>

      <div className="card-glow p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">접속 주소</h3>
          <span className="text-xs text-text-dim">{subdomains.length} / 2</span>
        </div>
        <div className="space-y-2">
          {subdomains.map((s) => (
            <div key={s.id} className="relative flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-mono min-w-0 break-all">
                {s.subdomain}.{server.subdomainZone} {s.isPrimary && <span className="text-text-dim text-xs">(기본)</span>}
              </span>
              <div className="flex items-center gap-3 shrink-0">
                <AddressActions address={`${s.subdomain}.${server.subdomainZone}`} />
                {server.isOwner && (
                  <button onClick={() => removeSubdomain(s.id)} className="text-red text-xs">삭제</button>
                )}
              </div>
            </div>
          ))}
          {subdomains.length === 0 && <p className="text-sm text-text-dim">주소 준비 중이에요.</p>}
        </div>

        {server.isOwner && subdomains.length < 2 && (
          <form onSubmit={addSubdomain} className="flex gap-2 mt-3 pt-3 border-t border-border">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="예: play"
              className="input flex-1 text-sm"
            />
            <button type="submit" disabled={subLoading || !newName} className="btn-secondary px-3 py-1.5 text-sm">
              주소 추가
            </button>
          </form>
        )}
        {subError && <p className="text-xs text-red mt-2">{subError}</p>}
      </div>

      <CustomDomainCard serverId={server.id} isOwner={server.isOwner} initial={server.customDomains} />

      {server.isFreeServer && server.isOwner && <FreeUpgradeCard serverId={server.id} />}
      {server.isFreeServer && <FreeTierAd />}
      {server.isFreeServer && <GoogleAdSense />}
    </div>
  );
}

function Stat({
  icon: Icon,
  color,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  color: string;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="card-glow p-4">
      <span
        className="w-8 h-8 rounded-xl flex items-center justify-center"
        style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }}
      >
        <Icon size={15} style={{ color }} />
      </span>
      <div className="text-xs text-text-dim mt-2.5">{label}</div>
      <div className="mt-0.5 font-semibold text-sm">{value}</div>
    </div>
  );
}

function formatUptime(ms: number) {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}시간 ${m}분`;
}
