"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Layers, Check } from "lucide-react";
import EmptyState from "@/components/EmptyState";

interface ServerSummary {
  id: string;
  name: string;
}
interface EnvGroup {
  id: string;
  name: string;
  variables: Record<string, string>;
  servers: ServerSummary[];
}

export default function EnvGroupsClient({ servers }: { servers: ServerSummary[] }) {
  const [groups, setGroups] = useState<EnvGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch("/api/env-groups")
      .then((r) => (r.ok ? r.json() : []))
      .then(setGroups)
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/env-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGroups((prev) => [...prev, data]);
      setNewName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "생성 실패");
    } finally {
      setCreating(false);
    }
  }

  async function deleteGroup(id: string) {
    if (!confirm("이 그룹을 삭제할까요? 연결된 서버들의 연결만 끊기고, 이미 적용된 값은 그대로 남아요.")) return;
    await fetch(`/api/env-groups/${id}`, { method: "DELETE" });
    setGroups((prev) => prev.filter((g) => g.id !== id));
  }

  return (
    <div className="mt-6 space-y-4">
      {groups.map((g) => (
        <EnvGroupCard key={g.id} group={g} allServers={servers} onDelete={() => deleteGroup(g.id)} onReload={load} />
      ))}

      {!loading && groups.length === 0 && (
        <EmptyState art="empty-list" compact title="아직 만든 환경변수 그룹이 없어요." />
      )}

      <form onSubmit={createGroup} className="card-glow p-4 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="그룹 이름 (예: 공용 API 키)"
          className="input flex-1 text-sm"
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="btn-primary px-4 py-2 text-sm inline-flex items-center gap-1.5 shrink-0"
        >
          <Plus size={14} /> 그룹 만들기
        </button>
      </form>
      {error && <p className="text-sm text-red">{error}</p>}
    </div>
  );
}

function EnvGroupCard({
  group,
  allServers,
  onDelete,
  onReload,
}: {
  group: EnvGroup;
  allServers: ServerSummary[];
  onDelete: () => void;
  onReload: () => void;
}) {
  const [rows, setRows] = useState<{ key: string; value: string }[]>(
    Object.entries(group.variables).map(([key, value]) => ({ key, value })),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachServerId, setAttachServerId] = useState("");
  const [attaching, setAttaching] = useState(false);

  const attachedIds = new Set(group.servers.map((s) => s.id));
  const availableServers = allServers.filter((s) => !attachedIds.has(s.id));

  function updateRow(i: number, field: "key" | "value", value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }
  function addRow() {
    setRows((prev) => [...prev, { key: "", value: "" }]);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const variables: Record<string, string> = {};
      for (const r of rows) {
        if (!r.key.trim()) continue;
        variables[r.key.trim()] = r.value;
      }
      const res = await fetch(`/api/env-groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables, reapply: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.failures?.length > 0) {
        setError(`일부 서버에 적용하지 못했어요: ${data.failures.map((f: { serverName: string }) => f.serverName).join(", ")}`);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function attach() {
    if (!attachServerId) return;
    setAttaching(true);
    try {
      await fetch(`/api/env-groups/${group.id}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId: attachServerId }),
      });
      setAttachServerId("");
      onReload();
    } finally {
      setAttaching(false);
    }
  }

  async function detach(serverId: string) {
    await fetch(`/api/env-groups/${group.id}/detach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverId }),
    });
    onReload();
  }

  return (
    <div className="card-glow p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Layers size={16} className="text-accent shrink-0" />
          <h3 className="font-semibold text-sm truncate">{group.name}</h3>
        </div>
        <button onClick={onDelete} className="text-text-dim hover:text-red p-1 shrink-0" title="그룹 삭제">
          <Trash2 size={14} />
        </button>
      </div>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <input
              className="input flex-1 text-xs font-mono"
              placeholder="KEY"
              value={r.key}
              onChange={(e) => updateRow(i, "key", e.target.value)}
            />
            <input
              className="input flex-1 text-xs font-mono"
              placeholder="value"
              value={r.value}
              onChange={(e) => updateRow(i, "value", e.target.value)}
            />
            <button onClick={() => removeRow(i)} className="text-text-dim hover:text-red px-1 shrink-0">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        <button onClick={addRow} className="text-xs text-accent hover:underline inline-flex items-center gap-1">
          <Plus size={12} /> 변수 추가
        </button>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button onClick={save} disabled={saving} className="btn-secondary px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5">
          {saved ? <Check size={13} className="text-green" /> : null}
          {saving ? "적용 중..." : "저장 + 서버에 적용"}
        </button>
      </div>
      {error && <p className="text-xs text-red">{error}</p>}

      <div className="pt-3 border-t border-border space-y-2">
        <p className="text-xs text-text-dim">연결된 서버 ({group.servers.length}개)</p>
        {group.servers.map((s) => (
          <div key={s.id} className="flex items-center justify-between text-sm">
            <span className="truncate">{s.name}</span>
            <button onClick={() => detach(s.id)} className="text-xs text-text-dim hover:text-red shrink-0">연결 해제</button>
          </div>
        ))}
        {availableServers.length > 0 && (
          <div className="flex gap-2 pt-1">
            <select
              className="input flex-1 text-xs"
              value={attachServerId}
              onChange={(e) => setAttachServerId(e.target.value)}
            >
              <option value="">서버 선택</option>
              {availableServers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button
              onClick={attach}
              disabled={attaching || !attachServerId}
              className="btn-secondary px-3 py-1.5 text-xs shrink-0"
            >
              연결
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
