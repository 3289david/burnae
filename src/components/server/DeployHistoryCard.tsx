"use client";

import { useEffect, useState } from "react";
import { History, CheckCircle2, XCircle, Webhook, User } from "lucide-react";

interface DeployLogEntry {
  id: string;
  trigger: "MANUAL" | "WEBHOOK";
  actorName: string | null;
  success: boolean;
  output: string;
  startedAt: string;
  durationMs: number;
}

/** Render/Railway의 "deploy log" 화면과 같은 개념 — 서버가 git 배포를 지원할 때만 보인다.
 * GitDeployCard와 독립적으로 자기 데이터를 불러와서, 두 컴포넌트가 서로 건드리지 않아도 된다. */
export default function DeployHistoryCard({ serverId }: { serverId: string }) {
  const [logs, setLogs] = useState<DeployLogEntry[] | null>(null);
  const [supportsGit, setSupportsGit] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/servers/${serverId}/deploy`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setSupportsGit(!!data?.supportsGit));
  }, [serverId]);

  useEffect(() => {
    if (!supportsGit) return;
    fetch(`/api/servers/${serverId}/deploy-history`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setLogs);
  }, [serverId, supportsGit]);

  if (!supportsGit || !logs || logs.length === 0) return null;

  return (
    <div className="card-glow p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">
          <History size={15} className="text-text-dim" />
        </span>
        <div>
          <h3 className="font-semibold text-sm">배포 이력</h3>
          <p className="text-xs text-text-dim">최근 20건</p>
        </div>
      </div>

      <div className="space-y-1.5">
        {logs.map((log) => (
          <div key={log.id} className="rounded-xl border border-border overflow-hidden">
            <button
              onClick={() => setExpandedId((id) => (id === log.id ? null : log.id))}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-xs hover:bg-surface-2/50 text-left"
            >
              <span className="flex items-center gap-2 min-w-0">
                {log.success ? (
                  <CheckCircle2 size={14} className="text-green shrink-0" />
                ) : (
                  <XCircle size={14} className="text-red shrink-0" />
                )}
                <span className="flex items-center gap-1 text-text-dim shrink-0">
                  {log.trigger === "WEBHOOK" ? <Webhook size={11} /> : <User size={11} />}
                  {log.trigger === "WEBHOOK" ? "GitHub push" : log.actorName ?? "수동"}
                </span>
                <span className="text-text-dim shrink-0">·</span>
                <span className="truncate">{new Date(log.startedAt).toLocaleString("ko-KR")}</span>
              </span>
              <span className="text-text-dim shrink-0">{(log.durationMs / 1000).toFixed(1)}초</span>
            </button>
            {expandedId === log.id && (
              <pre className="text-[11px] font-mono bg-bg px-3 py-2.5 border-t border-border whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                {log.output || "(출력 없음)"}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
