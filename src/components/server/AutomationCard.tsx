"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Toggle from "@/components/Toggle";

interface Props {
  serverId: string;
  autoBackupEnabled: boolean;
  autoBackupIntervalHours: number;
  autoRestartEnabled: boolean;
  autoRestartHour: number | null;
}

export default function AutomationCard({ serverId, ...initial }: Props) {
  const t = useTranslations("automationCard");
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
    <div className="card-glow p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">{t("title")} {saving && <span className="text-xs text-text-dim">{t("saving")}</span>}</h3>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm">{t("autoBackupTitle")}</p>
          <p className="text-xs text-text-dim">{t("autoBackupDesc")}</p>
        </div>
        <div className="flex items-center gap-2">
          {state.autoBackupEnabled && (
            <select
              className="input text-sm"
              value={state.autoBackupIntervalHours}
              onChange={(e) => update({ autoBackupIntervalHours: Number(e.target.value) })}
            >
              <option value={6}>{t("every6h")}</option>
              <option value={12}>{t("every12h")}</option>
              <option value={24}>{t("every24h")}</option>
              <option value={72}>{t("every3d")}</option>
            </select>
          )}
          <Toggle checked={state.autoBackupEnabled} onChange={(next) => update({ autoBackupEnabled: next })} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm">{t("autoRestartTitle")}</p>
          <p className="text-xs text-text-dim">{t("autoRestartDesc")}</p>
        </div>
        <div className="flex items-center gap-2">
          {state.autoRestartEnabled && (
            <select
              className="input text-sm"
              value={state.autoRestartHour ?? 4}
              onChange={(e) => update({ autoRestartHour: Number(e.target.value) })}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{t("hourOption", { hour: h })}</option>
              ))}
            </select>
          )}
          <Toggle
            checked={state.autoRestartEnabled}
            onChange={(next) => update({ autoRestartEnabled: next, autoRestartHour: state.autoRestartHour ?? 4 })}
          />
        </div>
      </div>
    </div>
  );
}
