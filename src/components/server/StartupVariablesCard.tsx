"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";

interface StartupVariable {
  name: string;
  description: string;
  envVariable: string;
  serverValue: string;
  isEditable: boolean;
  rules: string;
}

export default function StartupVariablesCard({ serverId }: { serverId: string }) {
  const [variables, setVariables] = useState<StartupVariable[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/servers/${serverId}/startup`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: StartupVariable[]) => {
        setVariables(data);
        setValues(Object.fromEntries(data.map((v) => [v.envVariable, v.serverValue])));
      });
  }, [serverId]);

  async function save(envVariable: string) {
    setSaving(envVariable);
    setSaved(null);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/startup`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: envVariable, value: values[envVariable] ?? "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSaved(envVariable);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(null);
    }
  }

  const editable = variables?.filter((v) => v.isEditable) ?? [];
  if (variables !== null && editable.length === 0) return null;

  return (
    <div className="card-glow p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
          <KeyRound size={15} className="text-accent" />
        </span>
        <div>
          <h3 className="font-semibold text-sm">시작 변수</h3>
          <p className="text-xs text-text-dim">봇 토큰, API 키 등 — 바꾸면 서버를 재시작해야 적용돼요.</p>
        </div>
      </div>

      {variables === null && <p className="text-sm text-text-dim">불러오는 중...</p>}

      <div className="space-y-2.5">
        {editable.map((v) => (
          <div key={v.envVariable} className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs text-text-dim">{v.name} <span className="font-mono">({v.envVariable})</span></label>
              <input
                type="text"
                className="input w-full mt-1 font-mono text-sm"
                value={values[v.envVariable] ?? ""}
                onChange={(e) => setValues({ ...values, [v.envVariable]: e.target.value })}
              />
            </div>
            <button
              onClick={() => save(v.envVariable)}
              disabled={saving !== null}
              className="btn-secondary px-3.5 py-2 text-xs shrink-0"
            >
              {saving === v.envVariable ? "저장 중..." : saved === v.envVariable ? "저장됨" : "저장"}
            </button>
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-red">{error}</p>}
    </div>
  );
}
