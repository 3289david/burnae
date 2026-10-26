"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { AlertTriangle, Loader2, RefreshCw, RotateCcw, Trash2, Lock, Unlock } from "lucide-react";
import { hasServerRank, type ServerAccessRole } from "@/lib/serverRoleRank";

interface Backup {
  uuid: string;
  name: string;
  bytes: number;
  is_successful: boolean;
  is_locked: boolean;
  created_at: string;
  completed_at: string | null;
}

export default function BackupsTab({
  serverId,
  backupSlots,
  myRole,
}: {
  serverId: string;
  backupSlots: number;
  myRole: ServerAccessRole | null;
}) {
  const t = useTranslations("backupsTab");
  const dateLocale = "ko-KR";
  const canCreate = hasServerRank(myRole, "DEVELOPER");
  const canManage = hasServerRank(myRole, "ADMIN");
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/servers/${serverId}/backups`);
    if (res.ok) setBackups(await res.json());
  }, [serverId]);

  useEffect(() => {
    load();
  }, [load]);

  // 백업 생성은 비동기라 completed_at이 찍히기 전까진 is_successful이 그냥 false인 "진행 중" 상태다
  // — 이걸 바로 "실패"로 보여주면 사용자가 아직 끝나지도 않은 백업을 실패로 오해하고 지워버릴 수 있다.
  // 진행 중인 백업이 있으면 다 끝날 때까지 주기적으로 다시 불러온다.
  const hasPending = backups.some((b) => !b.completed_at);
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [hasPending, load]);

  async function createBackup() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/backups`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("createFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function restore(uuid: string) {
    if (!confirm(t("restoreConfirm"))) return;
    setLoading(true);
    try {
      await fetch(`/api/servers/${serverId}/backups/${uuid}/restore`, { method: "POST" });
    } finally {
      setLoading(false);
    }
  }

  async function remove(uuid: string) {
    if (!confirm(t("deleteConfirm"))) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/backups/${uuid}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t("deleteFailed"));
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("deleteFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function toggleLock(uuid: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/backups/${uuid}/lock`, { method: "POST" });
      if (!res.ok) throw new Error(t("lockToggleFailed"));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("lockToggleFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-fade-up">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-text-dim">{t("usageLine", { used: backups.length, total: backupSlots })}</p>
        {canCreate && (
          <button onClick={createBackup} disabled={loading} className="btn-primary px-4 py-2 text-sm inline-flex items-center gap-1.5 active:scale-95 transition-transform">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> {t("backupNow")}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red mb-3">{error}</p>}
      <div className="space-y-2.5">
        {backups.map((b, i) => (
          <div
            key={b.uuid}
            className="card-glow p-4 flex flex-wrap items-center justify-between gap-2 animate-fade-up"
            style={{ animationDelay: `${Math.min(i, 8) * 0.04}s` }}
          >
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{b.name}</p>
              <p className="text-xs text-text-dim mt-0.5 flex items-center gap-1 flex-wrap">
                {new Date(b.created_at).toLocaleString(dateLocale)} · {(b.bytes / 1024 / 1024).toFixed(0)}MB
                {!b.completed_at ? (
                  <span className="inline-flex items-center gap-1 text-text-dim">
                    · <Loader2 size={12} className="animate-spin" /> {t("inProgress")}
                  </span>
                ) : !b.is_successful && (
                  <span className="inline-flex items-center gap-1 text-red">
                    · <AlertTriangle size={12} /> {t("failed")}
                  </span>
                )}
                {b.is_locked && (
                  <span className="inline-flex items-center gap-1 text-yellow">
                    · <Lock size={11} /> {t("locked")}
                  </span>
                )}
              </p>
            </div>
            {canManage && (
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => restore(b.uuid)}
                  disabled={!b.completed_at}
                  className="btn-secondary px-3 py-1.5 text-sm inline-flex items-center gap-1 active:scale-95 transition-transform disabled:opacity-40"
                >
                  <RotateCcw size={13} /> {t("restore")}
                </button>
                <button
                  onClick={() => toggleLock(b.uuid)}
                  disabled={loading || !b.completed_at}
                  className="btn-secondary px-3 py-1.5 text-sm inline-flex items-center gap-1 active:scale-95 transition-transform disabled:opacity-40"
                  title={b.is_locked ? t("unlockHint") : t("lockHint")}
                >
                  {b.is_locked ? (
                    <Unlock size={13} key="unlocked" className="animate-star-pop" />
                  ) : (
                    <Lock size={13} key="locked" />
                  )}{" "}
                  {b.is_locked ? t("unlock") : t("lock")}
                </button>
                <button
                  onClick={() => remove(b.uuid)}
                  disabled={b.is_locked || !b.completed_at}
                  className="rounded-full px-3 py-1.5 text-sm text-red bg-red/10 hover:bg-red/20 transition-colors inline-flex items-center gap-1 disabled:opacity-40 active:scale-95"
                >
                  <Trash2 size={13} /> {t("delete")}
                </button>
              </div>
            )}
          </div>
        ))}
        {backups.length === 0 && (
          <div className="card-glow p-8 text-center text-sm text-text-dim">{t("noBackups")}</div>
        )}
      </div>
    </div>
  );
}
