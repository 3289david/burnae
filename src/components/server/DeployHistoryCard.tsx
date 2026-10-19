"use client";

import { useEffect, useState } from "react";
import { History, CheckCircle2, XCircle, Webhook, User, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";

interface DeployLogEntry {
  id: string;
  trigger: "MANUAL" | "WEBHOOK";
  actorName: string | null;
  success: boolean;
  output: string;
  startedAt: string;
  durationMs: number;
  commitSha: string | null;
}

/** Render/Railway의 "deploy log" 화면과 같은 개념 — 서버가 git 배포를 지원할 때만 보인다.
 * GitDeployCard와 독립적으로 자기 데이터를 불러와서, 두 컴포넌트가 서로 건드리지 않아도 된다. */
export default function DeployHistoryCard({ serverId }: { serverId: string }) {
  const t = useTranslations("deployHistory");
  const [logs, setLogs] = useState<DeployLogEntry[] | null>(null);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [rollbackMsg, setRollbackMsg] = useState<string | null>(null);
  const [supportsGit, setSupportsGit] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function loadLogs() {
    fetch(`/api/servers/${serverId}/deploy-history`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setLogs);
  }

  useEffect(() => {
    fetch(`/api/servers/${serverId}/deploy`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setSupportsGit(!!data?.supportsGit));
  }, [serverId]);

  useEffect(() => {
    if (!supportsGit) return;
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, supportsGit]);

  async function rollback(logId: string) {
    if (!confirm(t("rollbackConfirm"))) return;
    setRollingBack(logId);
    setRollbackMsg(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/deploy-history/${logId}/rollback`, { method: "POST" });
      const data = await res.json();
      setRollbackMsg(data.ok ? t("rollbackSuccess") : t("rollbackFailed", { detail: data.output?.slice(0, 150) ?? data.error ?? "" }));
      loadLogs();
    } catch {
      setRollbackMsg(t("rollbackRequestFailed"));
    } finally {
      setRollingBack(null);
    }
  }

  if (!supportsGit || !logs || logs.length === 0) return null;

  return (
    <div className="card-glow p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">
          <History size={15} className="text-text-dim" />
        </span>
        <div>
          <h3 className="font-semibold text-sm">{t("title")}</h3>
          <p className="text-xs text-text-dim">{t("subtitle")}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        {logs.map((log, i) => (
          <div key={log.id} className="rounded-xl border border-border overflow-hidden">
            <div className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-xs hover:bg-surface-2/50">
              <button
                onClick={() => setExpandedId((id) => (id === log.id ? null : log.id))}
                className="flex items-center gap-2 min-w-0 text-left flex-1"
              >
                {log.success ? (
                  <CheckCircle2 size={14} className="text-green shrink-0" />
                ) : (
                  <XCircle size={14} className="text-red shrink-0" />
                )}
                <span className="flex items-center gap-1 text-text-dim shrink-0">
                  {log.trigger === "WEBHOOK" ? <Webhook size={11} /> : <User size={11} />}
                  {log.trigger === "WEBHOOK" ? t("webhookTrigger") : log.actorName ?? t("manualTrigger")}
                </span>
                <span className="text-text-dim shrink-0">·</span>
                <span className="truncate">{new Date(log.startedAt).toLocaleString()}</span>
              </button>
              <div className="flex items-center gap-2 shrink-0">
                {log.commitSha && i > 0 && (
                  <button
                    onClick={() => rollback(log.id)}
                    disabled={rollingBack === log.id}
                    title={t("rollback")}
                    className="text-text-dim hover:text-accent flex items-center gap-1"
                  >
                    <RotateCcw size={12} className={rollingBack === log.id ? "animate-spin" : ""} />
                  </button>
                )}
                <span className="text-text-dim">{(log.durationMs / 1000).toFixed(1)}{t("secondsUnit")}</span>
              </div>
            </div>
            {expandedId === log.id && (
              <pre className="text-[11px] font-mono bg-bg px-3 py-2.5 border-t border-border whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                {log.output || t("noOutput")}
              </pre>
            )}
          </div>
        ))}
      </div>
      {rollbackMsg && <p className="text-xs text-text-dim">{rollbackMsg}</p>}
    </div>
  );
}
