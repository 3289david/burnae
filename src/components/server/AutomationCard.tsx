"use client";

import { useState } from "react";

interface Props {
  serverId: string;
  autoBackupEnabled: boolean;
  autoBackupIntervalHours: number;
  autoRestartEnabled: boolean;
  autoRestartHour: number | null;
}

export default function AutomationCard({ serverId, ...initial }: Props) {
  const [state, setState] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function update(patch: Partial<Props>) {
    const next = { ...state, ...patch };
    setState(next);
    setSaving(true);
    try {
      await fetch(`/api/servers/${serverId}/automation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">자동화 {saving && <span className="text-xs text-text-dim">저장 중...</span>}</h3>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm">자동 백업</p>
          <p className="text-xs text-text-dim">백업 슬롯이 가득 차면 건너뛰어요.</p>
        </div>
        <div className="flex items-center gap-2">
          {state.autoBackupEnabled && (
            <select
              className="input text-sm"
              value={state.autoBackupIntervalHours}
              onChange={(e) => update({ autoBackupIntervalHours: Number(e.target.value) })}
            >
              <option value={6}>6시간마다</option>
              <option value={12}>12시간마다</option>
              <option value={24}>24시간마다</option>
              <option value={72}>3일마다</option>
            </select>
          )}
          <input
            type="checkbox"
            checked={state.autoBackupEnabled}
            onChange={(e) => update({ autoBackupEnabled: e.target.checked })}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm">예약 재시작</p>
          <p className="text-xs text-text-dim">매일 지정한 시각(한국 시간)에 자동으로 재시작해요.</p>
        </div>
        <div className="flex items-center gap-2">
          {state.autoRestartEnabled && (
            <select
              className="input text-sm"
              value={state.autoRestartHour ?? 4}
              onChange={(e) => update({ autoRestartHour: Number(e.target.value) })}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{h}시</option>
              ))}
            </select>
          )}
          <input
            type="checkbox"
            checked={state.autoRestartEnabled}
            onChange={(e) => update({ autoRestartEnabled: e.target.checked, autoRestartHour: state.autoRestartHour ?? 4 })}
          />
        </div>
      </div>
    </div>
  );
}
