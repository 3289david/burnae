"use client";

import { useEffect, useState } from "react";
import { Timer, Trash2, Plus } from "lucide-react";
import Toggle from "@/components/Toggle";

interface Task {
  id: string;
  name: string;
  command: string;
  intervalMinutes: number;
  enabled: boolean;
  lastRunAt: string | null;
}

export default function ScheduledTasksCard({ serverId }: { serverId: string }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [interval, setInterval_] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/servers/${serverId}/scheduled-tasks`);
    if (res.ok) setTasks(await res.json());
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/scheduled-tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, command, intervalMinutes: interval }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setName("");
      setCommand("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "추가 실패");
    } finally {
      setBusy(false);
    }
  }

  async function toggleTask(id: string, enabled: boolean) {
    await fetch(`/api/servers/${serverId}/scheduled-tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    await load();
  }

  async function remove(id: string) {
    if (!confirm("이 예약 작업을 삭제할까요?")) return;
    await fetch(`/api/servers/${serverId}/scheduled-tasks/${id}`, { method: "DELETE" });
    await load();
  }

  if (!tasks) return null;

  return (
    <div className="card-glow p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
          <Timer size={15} className="text-accent" />
        </span>
        <div>
          <h3 className="font-semibold text-sm">예약 작업 (크론)</h3>
          <p className="text-xs text-text-dim">주기적으로 콘솔 명령을 자동 실행해요. 서버가 켜져 있을 때만 실행되고, 최대 10분까지 늦어질 수 있어요.</p>
        </div>
      </div>

      <div className="space-y-2">
        {tasks.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3.5 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="font-medium truncate">{t.name}</p>
              <p className="text-xs text-text-dim font-mono truncate">
                {t.command} · {t.intervalMinutes}분마다
                {t.lastRunAt && ` · 마지막 실행 ${new Date(t.lastRunAt).toLocaleString("ko-KR")}`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Toggle checked={t.enabled} onChange={(next) => toggleTask(t.id, next)} size="sm" />
              <button onClick={() => remove(t.id)} className="text-red hover:text-red/80">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {tasks.length === 0 && <p className="text-sm text-text-dim">아직 예약 작업이 없어요.</p>}
      </div>

      <form onSubmit={add} className="flex flex-wrap gap-2 pt-2 border-t border-border">
        <input
          required
          maxLength={60}
          className="input flex-1 min-w-[120px] text-sm"
          placeholder="이름 (예: 매일 저장)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          required
          maxLength={500}
          className="input flex-1 min-w-[160px] text-sm font-mono"
          placeholder="콘솔 명령어 (예: save-all)"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
        />
        <input
          type="number"
          min={10}
          className="input w-24 text-sm"
          value={interval}
          onChange={(e) => setInterval_(Number(e.target.value))}
        />
        <span className="text-xs text-text-dim self-center">분마다</span>
        <button type="submit" disabled={busy} className="btn-primary px-3.5 py-2 text-xs inline-flex items-center gap-1.5">
          <Plus size={13} /> 추가
        </button>
      </form>
      {error && <p className="text-xs text-red">{error}</p>}
    </div>
  );
}
