"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, RotateCcw, Trash2, Lock, Unlock } from "lucide-react";

interface Backup {
  uuid: string;
  name: string;
  bytes: number;
  is_successful: boolean;
  is_locked: boolean;
  created_at: string;
}

export default function BackupsTab({ serverId, backupSlots }: { serverId: string; backupSlots: number }) {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/servers/${serverId}/backups`);
    if (res.ok) setBackups(await res.json());
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  async function createBackup() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/backups`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "백업 생성 실패");
    } finally {
      setLoading(false);
    }
  }

  async function restore(uuid: string) {
    if (!confirm("이 백업으로 복원하면 현재 데이터를 덮어씁니다. 계속할까요?")) return;
    setLoading(true);
    try {
      await fetch(`/api/servers/${serverId}/backups/${uuid}/restore`, { method: "POST" });
    } finally {
      setLoading(false);
    }
  }

  async function remove(uuid: string) {
    if (!confirm("이 백업을 삭제할까요?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/backups/${uuid}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "삭제 실패");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setLoading(false);
    }
  }

  async function toggleLock(uuid: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/backups/${uuid}/lock`, { method: "POST" });
      if (!res.ok) throw new Error("잠금 변경 실패");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "잠금 변경 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-fade-up">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-text-dim">{backups.length} / {backupSlots}개 사용 중</p>
        <button onClick={createBackup} disabled={loading} className="btn-primary px-4 py-2 text-sm inline-flex items-center gap-1.5">
          <RefreshCw size={14} /> 지금 백업
        </button>
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
                {new Date(b.created_at).toLocaleString("ko-KR")} · {(b.bytes / 1024 / 1024).toFixed(0)}MB
                {!b.is_successful && (
                  <span className="inline-flex items-center gap-1 text-red">
                    · <AlertTriangle size={12} /> 실패
                  </span>
                )}
                {b.is_locked && (
                  <span className="inline-flex items-center gap-1 text-yellow">
                    · <Lock size={11} /> 잠김
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => restore(b.uuid)} className="btn-secondary px-3 py-1.5 text-sm inline-flex items-center gap-1">
                <RotateCcw size={13} /> 복원
              </button>
              <button
                onClick={() => toggleLock(b.uuid)}
                disabled={loading}
                className="btn-secondary px-3 py-1.5 text-sm inline-flex items-center gap-1"
                title={b.is_locked ? "잠금 해제하면 삭제할 수 있어요" : "잠그면 실수로 삭제되지 않아요"}
              >
                {b.is_locked ? <Unlock size={13} /> : <Lock size={13} />} {b.is_locked ? "잠금 해제" : "잠그기"}
              </button>
              <button
                onClick={() => remove(b.uuid)}
                disabled={b.is_locked}
                className="rounded-full px-3 py-1.5 text-sm text-red bg-red/10 hover:bg-red/20 transition-colors inline-flex items-center gap-1 disabled:opacity-40"
              >
                <Trash2 size={13} /> 삭제
              </button>
            </div>
          </div>
        ))}
        {backups.length === 0 && (
          <div className="card-glow p-8 text-center text-sm text-text-dim">아직 백업이 없어요.</div>
        )}
      </div>
    </div>
  );
}
