"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Ban, Clock, Play, Square, RotateCw, Gauge, Cpu, MemoryStick, HardDrive } from "lucide-react";
import type { ServerInfo } from "./ServerDetailClient";
import { hasServerRank } from "@/lib/serverRoleRank";
import StatusDot from "@/components/StatusDot";
import Toggle from "@/components/Toggle";
import AddressActions from "./AddressActions";
import FreeTierAd from "@/components/ads/FreeTierAd";
import GoogleAdSense from "@/components/ads/GoogleAdSense";
import GettingStartedCard from "./GettingStartedCard";
import AiAutoSetupCard from "./AiAutoSetupCard";
import SuccessCheck from "@/components/SuccessCheck";
import CountUp from "@/components/CountUp";
import { formatMb } from "@/lib/formatSize";
import UsageHistoryChart from "./UsageHistoryChart";
import ServerActivityFeed from "./ServerActivityFeed";

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

const KNOWN_PROPERTIES_KEYS = [
  { key: "difficulty", label: "난이도", type: "select", options: ["peaceful", "easy", "normal", "hard"] },
  { key: "gamemode", label: "게임 모드", type: "select", options: ["survival", "creative", "adventure", "spectator"] },
  { key: "pvp", label: "PVP", type: "bool" },
  { key: "max-players", label: "최대 플레이어", type: "number" },
  { key: "white-list", label: "화이트리스트", type: "bool" },
  { key: "enable-command-block", label: "커맨드 블럭", type: "bool" },
  { key: "online-mode", label: "온라인 모드(정품 인증)", type: "bool" },
  { key: "spawn-protection", label: "스폰 보호 범위", type: "number" },
  { key: "view-distance", label: "View Distance", type: "number" },
] as const;

function parseProperties(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    map[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return map;
}

function serializeProperties(original: string, values: Record<string, string>): string {
  const lines = original.split("\n");
  const seen = new Set<string>();
  const result = lines.map((line) => {
    if (!line || line.startsWith("#")) return line;
    const idx = line.indexOf("=");
    if (idx === -1) return line;
    const key = line.slice(0, idx).trim();
    if (key in values) {
      seen.add(key);
      return `${key}=${values[key]}`;
    }
    return line;
  });
  for (const [key, value] of Object.entries(values)) {
    if (!seen.has(key)) result.push(`${key}=${value}`);
  }
  return result.join("\n");
}

export default function OverviewTab({ server }: { server: ServerInfo }) {
  const [resources, setResources] = useState<Resources | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [renewError, setRenewError] = useState<string | null>(null);
  const [renewRequested, setRenewRequested] = useState(false);
  const isMinecraft = server.templateCategory === "MINECRAFT";
  const [raw, setRaw] = useState<string | null>(null);
  const [propsValues, setPropsValues] = useState<Record<string, string>>({});
  const [propsLoading, setPropsLoading] = useState(false);
  const [propsSaved, setPropsSaved] = useState(false);
  const [propsError, setPropsError] = useState<string | null>(null);
  const [note, setNote] = useState(server.ownerNote ?? "");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  useEffect(() => {
    if (!isMinecraft) return;
    fetch(`/api/servers/${server.id}/files/content?file=${encodeURIComponent("/server.properties")}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.content) {
          setRaw(data.content);
          setPropsValues(parseProperties(data.content));
        }
      })
      .catch(() => setPropsError("server.properties를 불러오지 못했어요. 서버 종류에 따라 없을 수 있어요."));
  }, [server.id, isMinecraft]);

  async function saveProperties() {
    if (raw === null) return;
    setPropsLoading(true);
    setPropsSaved(false);
    try {
      const newContent = serializeProperties(raw, propsValues);
      const res = await fetch(`/api/servers/${server.id}/files/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: "/server.properties", content: newContent }),
      });
      if (!res.ok) throw new Error("저장 실패");
      setRaw(newContent);
      setPropsSaved(true);
    } catch (err) {
      setPropsError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setPropsLoading(false);
    }
  }

  async function restartAfterPropertiesSave() {
    await fetch(`/api/servers/${server.id}/power`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signal: "restart" }),
    });
  }

  async function saveNote() {
    setNoteSaving(true);
    setNoteSaved(false);
    setNoteError(null);
    try {
      const res = await fetch(`/api/servers/${server.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerNote: note }),
      });
      if (!res.ok) throw new Error();
      setNoteSaved(true);
    } catch {
      setNoteError("메모 저장에 실패했어요.");
    } finally {
      setNoteSaving(false);
    }
  }

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
    // 다음 5초 폴링을 기다리지 않고 누르자마자 바로 "시작 중/정지 중"으로 보이게 한다 —
    // 실제 Wings 상태는 바로 다음 poll()에서 다시 확인해서 틀렸으면 금방 바로잡는다.
    setResources((prev) =>
      prev ? { ...prev, current_state: signal === "stop" ? "stopping" : "starting" } : prev,
    );
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
    <div className="tab-grid">
      {server.isOwner && <GettingStartedCard server={server} />}
      {server.isOwner && server.aiAutoSetupAvailable && <AiAutoSetupCard serverId={server.id} />}

      {server.autoSleptAt && (
        <div className="card p-4 border-accent flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm flex items-center gap-1.5">
            💤 트래픽이 없어서 자동 절전 모드로 꺼져 있어요 (설정에서 언제든 끌 수 있어요).
          </p>
          <button
            disabled={actionLoading}
            onClick={() => power("start")}
            className="btn-primary px-3.5 py-1.5 text-sm inline-flex items-center gap-1.5 active:scale-95 transition-transform"
          >
            <Play size={14} /> 지금 깨우기
          </button>
        </div>
      )}

      {showRenewal && (
        <div className="card p-4 border-yellow">
          {renewRequested ? (
            <p className="text-sm text-green flex items-center gap-1.5">
              {server.isFreeServer ? <SuccessCheck size={20} /> : <CheckCircle2 size={16} />}
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
              <button onClick={renew} disabled={renewing} className="btn-primary px-4 py-1.5 text-sm mt-2 active:scale-95 transition-transform">
                {renewing ? "처리 중..." : server.isFreeServer ? "지금 7일 연장하기" : "지금 갱신하기"}
              </button>
              {renewError && <p className="text-xs text-red mt-1">{renewError}</p>}
            </>
          )}
        </div>
      )}

      {hasServerRank(server.myRole, "MODERATOR") && (
        <div className="flex gap-1.5">
          <button
            disabled={actionLoading}
            onClick={() => power("start")}
            className="flex-1 sm:flex-none rounded-lg px-3.5 py-2 text-sm inline-flex items-center justify-center gap-1.5 border border-border hover:bg-surface-2 transition-colors disabled:opacity-50"
          >
            <Play size={14} className="text-green" /> 시작
          </button>
          <button
            disabled={actionLoading}
            onClick={() => power("restart")}
            className="flex-1 sm:flex-none rounded-lg px-3.5 py-2 text-sm inline-flex items-center justify-center gap-1.5 border border-border hover:bg-surface-2 transition-colors disabled:opacity-50"
          >
            <RotateCw size={14} className={`text-yellow ${actionLoading ? "animate-spin" : ""}`} /> 재시작
          </button>
          <button
            disabled={actionLoading}
            onClick={() => power("stop")}
            className="flex-1 sm:flex-none rounded-lg px-3.5 py-2 text-sm inline-flex items-center justify-center gap-1.5 border border-border hover:bg-surface-2 transition-colors disabled:opacity-50"
          >
            <Square size={14} className="text-red" /> 중지
          </button>
        </div>
      )}

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
          value={
            resources ? (
              <>
                <CountUp value={resources.resources.memory_bytes / 1024 / 1024} format={(n) => Math.round(n).toString()} duration={600} />
                MB / {formatMb(server.ramMb)}
              </>
            ) : (
              "-"
            )
          }
        />
        <Stat
          icon={Cpu}
          color="var(--purple)"
          label="CPU"
          value={
            resources ? (
              <>
                <CountUp value={resources.resources.cpu_absolute} format={(n) => n.toFixed(0)} duration={600} />%
              </>
            ) : (
              "-"
            )
          }
        />
        <Stat icon={Clock} color="var(--cyan)" label="가동시간" value={resources ? formatUptime(resources.resources.uptime) : "-"} />
      </div>

      {/* 이 서버의 디스크 사용량 (전체 계정 저장공간 한도와는 별개) */}
      <div className="card-glow p-5 flex items-center gap-4 animate-fade-up">
        <span className="w-11 h-11 rounded-lg border border-border bg-surface-2 flex items-center justify-center shrink-0">
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

      <UsageHistoryChart serverId={server.id} ramMbLimit={server.ramMb} cpuPercentLimit={server.cpuPercent} />
      <ServerActivityFeed serverId={server.id} />

      <div className="card-glow p-5">
        <h3 className="font-semibold mb-3">서버 정보</h3>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <span className="text-text-dim">종류</span>
          <span>{server.templateName}{server.minecraftVersion && ` · ${server.minecraftVersion}`}</span>
          <span className="text-text-dim">RAM / 디스크</span>
          <span>{formatMb(server.ramMb)} / {formatMb(server.diskMb)}</span>
          <span className="text-text-dim">백업 슬롯</span>
          <span>{server.backupSlots}개</span>
          {server.extraPorts.length > 0 && (
            <>
              <span className="text-text-dim">추가 포트</span>
              <span className="font-mono">
                {server.extraPorts.map((p) => `${p.ip}:${p.port}`).join(", ")}
              </span>
            </>
          )}
          {server.accessSecret && (
            <>
              <span className="text-text-dim">접속 비밀번호</span>
              <span className="font-mono select-all">{server.accessSecret}</span>
            </>
          )}
        </div>
      </div>

      <div className="card-glow p-5">
        <h3 className="font-semibold mb-3">접속 주소</h3>
        <div className="space-y-2">
          {server.subdomains.map((s) => (
            <div key={s.id} className="relative flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-mono min-w-0 break-all">
                {s.subdomain}.{server.subdomainZone}
                {" "}{s.isPrimary && <span className="text-text-dim text-xs">(기본)</span>}
              </span>
              <AddressActions address={`${s.subdomain}.${server.subdomainZone}`} />
            </div>
          ))}
          {server.subdomains.length === 0 && <p className="text-sm text-text-dim">주소 준비 중이에요.</p>}
        </div>
        <p className="text-xs text-text-dim mt-3">주소 추가/삭제, 커스텀 도메인, SSH 접속은 "네트워크" 탭에서 관리해요.</p>
      </div>

      {isMinecraft && (
        <div className="card-glow p-5 space-y-4">
          <h3 className="font-semibold text-sm">게임 설정</h3>
          {propsError && <p className="text-sm text-red">{propsError}</p>}
          {raw === null && !propsError && <p className="text-sm text-text-dim">불러오는 중...</p>}
          {raw !== null && (
            <>
              {KNOWN_PROPERTIES_KEYS.map(({ key, label, type, ...rest }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm">{label}</span>
                  {type === "bool" ? (
                    <Toggle
                      checked={(propsValues[key] ?? "false") === "true"}
                      onChange={(next) => setPropsValues((v) => ({ ...v, [key]: String(next) }))}
                    />
                  ) : type === "select" ? (
                    <select
                      className="input"
                      value={propsValues[key] ?? ""}
                      onChange={(e) => setPropsValues((v) => ({ ...v, [key]: e.target.value }))}
                    >
                      {"options" in rest && rest.options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      type="number"
                      className="input w-28"
                      value={propsValues[key] ?? ""}
                      onChange={(e) => setPropsValues((v) => ({ ...v, [key]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
              <div className="pt-3 border-t border-border flex items-center gap-3">
                <button onClick={saveProperties} disabled={propsLoading} className="btn-primary px-4 py-2 text-sm active:scale-95 transition-transform">
                  {propsLoading ? "저장 중..." : "저장"}
                </button>
                <button onClick={restartAfterPropertiesSave} className="btn-secondary px-4 py-2 text-sm active:scale-95 transition-transform">저장 후 재시작</button>
                {propsSaved && <span className="text-sm text-green">저장됐어요. 적용하려면 재시작하세요.</span>}
              </div>
            </>
          )}
        </div>
      )}

      {server.isOwner && (
        <div className="card-glow p-5 space-y-2">
          <h3 className="font-semibold text-sm">메모</h3>
          <p className="text-xs text-text-dim">나만 볼 수 있는 비공개 메모</p>
          <textarea
            className="input w-full text-sm min-h-[70px] resize-y"
            value={note}
            maxLength={500}
            onChange={(e) => {
              setNote(e.target.value);
              setNoteSaved(false);
            }}
            placeholder="메모를 입력하세요..."
          />
          <button onClick={saveNote} disabled={noteSaving} className="btn-secondary px-4 py-2 text-sm active:scale-95 transition-transform">
            {noteSaving ? "저장 중..." : noteSaved ? "저장됨" : "저장"}
          </button>
          {noteError && <p className="text-xs text-red">{noteError}</p>}
        </div>
      )}

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
