"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UpgradeCard from "./UpgradeCard";
import AutomationCard from "./AutomationCard";
import StartupVariablesCard from "./StartupVariablesCard";
import SftpCard from "./SftpCard";

const KNOWN_KEYS = [
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

export default function SettingsTab({
  serverId,
  isOwner,
  productId,
  templateCategory,
  autoBackupEnabled,
  autoBackupIntervalHours,
  autoRestartEnabled,
  autoRestartHour,
}: {
  serverId: string;
  isOwner: boolean;
  productId: string | null;
  templateCategory: "MINECRAFT" | "VPS" | "DISCORD_BOT" | "GENERAL";
  autoBackupEnabled: boolean;
  autoBackupIntervalHours: number;
  autoRestartEnabled: boolean;
  autoRestartHour: number | null;
}) {
  const isMinecraft = templateCategory === "MINECRAFT";
  const router = useRouter();
  const [raw, setRaw] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reinstalling, setReinstalling] = useState(false);
  const [reinstallDone, setReinstallDone] = useState(false);
  const [keepBackup, setKeepBackup] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isMinecraft) return;
    fetch(`/api/servers/${serverId}/files/content?file=${encodeURIComponent("/server.properties")}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.content) {
          setRaw(data.content);
          setValues(parseProperties(data.content));
        }
      })
      .catch(() => setError("server.properties를 불러오지 못했어요. 서버 종류에 따라 없을 수 있어요."));
  }, [serverId, isMinecraft]);

  async function save() {
    if (raw === null) return;
    setLoading(true);
    setSaved(false);
    try {
      const newContent = serializeProperties(raw, values);
      const res = await fetch(`/api/servers/${serverId}/files/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: "/server.properties", content: newContent }),
      });
      if (!res.ok) throw new Error("저장 실패");
      setRaw(newContent);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function restart() {
    await fetch(`/api/servers/${serverId}/power`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signal: "restart" }),
    });
  }

  async function reinstall() {
    if (!confirm("서버를 재설치할까요? 설치 스크립트를 다시 실행해 초기 상태로 되돌립니다. 파일 대부분이 사라질 수 있어요.")) return;
    setReinstalling(true);
    setReinstallDone(false);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/reinstall`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "재설치 실패");
      setReinstallDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setReinstalling(false);
    }
  }

  async function deleteServer() {
    if (!confirm("정말 서버를 삭제할까요? 서버와 모든 파일이 삭제됩니다.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/servers/${serverId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ createFinalBackup: keepBackup }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "삭제 실패");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setDeleting(false);
    }
  }

  if (isMinecraft && error) return <p className="text-sm text-red">{error}</p>;
  if (isMinecraft && raw === null) return <p className="text-sm text-text-dim">불러오는 중...</p>;

  return (
    <div className="space-y-6 animate-fade-up">
    {isMinecraft && (
    <div className="card-glow p-5 space-y-4">
      {KNOWN_KEYS.map(({ key, label, type, ...rest }) => (
        <div key={key} className="flex items-center justify-between">
          <span className="text-sm">{label}</span>
          {type === "bool" ? (
            <select
              className="input"
              value={values[key] ?? "false"}
              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
            >
              <option value="true">ON</option>
              <option value="false">OFF</option>
            </select>
          ) : type === "select" ? (
            <select
              className="input"
              value={values[key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
            >
              {"options" in rest && rest.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              type="number"
              className="input w-28"
              value={values[key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
            />
          )}
        </div>
      ))}

      <div className="pt-3 border-t border-border flex items-center gap-3">
        <button onClick={save} disabled={loading} className="btn-primary px-4 py-2 text-sm">
          {loading ? "저장 중..." : "저장"}
        </button>
        <button onClick={restart} className="btn-secondary px-4 py-2 text-sm">저장 후 재시작</button>
        {saved && <span className="text-sm text-green">저장됐어요. 적용하려면 재시작하세요.</span>}
      </div>
    </div>
    )}

    {isOwner && <StartupVariablesCard serverId={serverId} />}

    {isOwner && <SftpCard serverId={serverId} />}

    {isOwner && (
      <AutomationCard
        serverId={serverId}
        autoBackupEnabled={autoBackupEnabled}
        autoBackupIntervalHours={autoBackupIntervalHours}
        autoRestartEnabled={autoRestartEnabled}
        autoRestartHour={autoRestartHour}
      />
    )}

    {isOwner && <UpgradeCard serverId={serverId} currentProductId={productId} />}

    {isOwner && (
      <div className="card-glow p-5 space-y-2">
        <h3 className="font-semibold text-sm">서버 재설치</h3>
        <p className="text-xs text-text-dim">
          {isMinecraft
            ? "서버 종류의 설치 스크립트를 다시 실행해 초기 상태로 되돌려요. 월드 등 대부분의 파일이 사라질 수 있어요."
            : "설치 스크립트를 다시 실행해 초기 상태로 되돌려요. GitHub repo에서 새로 배포하거나 꼬인 설치를 고칠 때 유용해요. 대부분의 파일이 사라질 수 있어요."}
        </p>
        <button onClick={reinstall} disabled={reinstalling} className="btn-secondary px-4 py-2 text-sm">
          {reinstalling ? "재설치 중..." : "재설치"}
        </button>
        {reinstallDone && <p className="text-sm text-green">재설치를 시작했어요. 콘솔에서 진행 상황을 확인하세요.</p>}
      </div>
    )}

    {isOwner && (
      <div className="card-glow p-5 border-red">
        <h3 className="font-semibold text-red">위험 구역</h3>
        <p className="text-sm text-text-dim mt-1">서버를 삭제하면 되돌릴 수 없습니다.</p>
        <label className="flex items-center gap-2 mt-3 text-sm">
          <input type="checkbox" checked={keepBackup} onChange={(e) => setKeepBackup(e.target.checked)} />
          삭제 전 마지막 백업 생성
        </label>
        <button onClick={deleteServer} disabled={deleting} className="btn-secondary text-red px-4 py-2 text-sm mt-3">
          {deleting ? "삭제 중..." : "서버 삭제"}
        </button>
      </div>
    )}
    </div>
  );
}
