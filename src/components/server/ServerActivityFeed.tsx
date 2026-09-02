"use client";

import { useEffect, useState } from "react";
import { History, Play, Square, RotateCw, Skull, RefreshCcw, Wrench, RotateCcw, UserPlus, UserMinus, ArrowUpCircle, Crown } from "lucide-react";
import { SERVER_ACTIVITY_LABELS } from "@/lib/serverActivityLabels";

interface ActivityLogEntry {
  id: string;
  action: string;
  detail: string | null;
  createdAt: string;
  actor: { name: string } | null;
}

const ACTION_ICON: Record<string, typeof Play> = {
  POWER_START: Play,
  POWER_STOP: Square,
  POWER_RESTART: RotateCw,
  POWER_KILL: Skull,
  BACKUP_RESTORE: RefreshCcw,
  REINSTALL: Wrench,
  RENEW: RotateCcw,
  MEMBER_ADD: UserPlus,
  MEMBER_REMOVE: UserMinus,
  RESOURCE_UPGRADE: ArrowUpCircle,
  OWNER_TRANSFER: Crown,
};

function timeAgo(iso: string): string {
  const diffSec = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return "방금 전";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  return `${Math.floor(diffSec / 86400)}일 전`;
}

export default function ServerActivityFeed({ serverId }: { serverId: string }) {
  const [logs, setLogs] = useState<ActivityLogEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/servers/${serverId}/activity`)
      .then((r) => r.json())
      .then((data) => alive && setLogs(data))
      .catch(() => alive && setLogs([]));
    return () => {
      alive = false;
    };
  }, [serverId]);

  if (!logs || logs.length === 0) return null;

  return (
    <div className="card-glow p-5 animate-fade-up">
      <h3 className="font-semibold mb-3 flex items-center gap-1.5">
        <History size={16} className="text-accent" /> 최근 활동
      </h3>
      <ul className="space-y-2.5">
        {logs.map((log) => {
          const Icon = ACTION_ICON[log.action] ?? History;
          return (
            <li key={log.id} className="flex items-start gap-2.5 text-sm">
              <Icon size={14} className="text-text-dim shrink-0 mt-0.5" />
              <span className="flex-1 min-w-0">
                <span>{SERVER_ACTIVITY_LABELS[log.action] ?? log.action}</span>
                {log.detail && <span className="text-text-dim"> · {log.detail}</span>}
                {log.actor?.name && <span className="text-text-dim"> · {log.actor.name}</span>}
              </span>
              <span className="text-[11px] text-text-dim shrink-0">{timeAgo(log.createdAt)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
