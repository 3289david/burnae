"use client";

import { useEffect, useState } from "react";

type SiteMode = "MINECRAFT_ONLY" | "GENERAL_ONLY" | "BOTH";

interface Settings {
  siteMode: SiteMode;
  ramPricePerGbKrw: number;
  minRamGb: number;
  maxRamGb: number;
  defaultDiskGb: number;
  diskPricePerGbKrw: number;
  defaultBackupSlots: number;
  backupPricePerSlotKrw: number;
  maxCpuPercentPerServer: number;
  siteName: string;
  siteDomain: string;
  subdomainZone: string;
  preorderAutoFulfillEnabled: boolean;
  forcePreorderEnabled: boolean;
}

const FIELDS: { key: keyof Settings; label: string; type: "number" | "text" }[] = [
  { key: "ramPricePerGbKrw", label: "RAM 단가 (원/GB)", type: "number" },
  { key: "minRamGb", label: "최소 RAM (GB)", type: "number" },
  { key: "maxRamGb", label: "최대 RAM (GB)", type: "number" },
  { key: "defaultDiskGb", label: "기본 디스크 (GB)", type: "number" },
  { key: "diskPricePerGbKrw", label: "추가 디스크 단가 (원/GB)", type: "number" },
  { key: "defaultBackupSlots", label: "기본 백업 슬롯 수", type: "number" },
  { key: "backupPricePerSlotKrw", label: "백업 슬롯 단가 (원)", type: "number" },
  { key: "maxCpuPercentPerServer", label: "서버당 최대 CPU (%)", type: "number" },
  { key: "siteName", label: "사이트 이름", type: "text" },
  { key: "siteDomain", label: "메인 도메인", type: "text" },
  { key: "subdomainZone", label: "서브도메인 존", type: "text" },
];

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings").then((r) => r.json()).then(setSettings);
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setSaved(true);
  }

  if (!settings) return <p className="text-text-dim text-sm">불러오는 중...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold">호스팅 설정</h1>
      <p className="text-sm text-text-dim mt-1">
        여기서 바꾸는 값은 즉시 고객 화면(가격, 저장공간 한도 등)에 반영됩니다.
      </p>

      <div className="card-glow p-5 mt-6">
        <label className="text-sm text-text-dim">사이트 모드</label>
        <p className="text-xs text-text-dim mt-0.5 mb-2">
          어떤 서비스를 노출할지 정해요. &ldquo;일반 서버&rdquo;는 VPS·디스코드 봇 호스팅 등
          마인크래프트가 아닌 서버 종류를 말해요 (서버 종류 관리에서 분류로 구분).
        </p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { value: "MINECRAFT_ONLY", label: "마인크래프트만" },
              { value: "GENERAL_ONLY", label: "일반 서버만" },
              { value: "BOTH", label: "둘 다" },
            ] as { value: SiteMode; label: string }[]
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSettings({ ...settings, siteMode: opt.value })}
              className={`px-3.5 py-1.5 rounded-full text-sm border ${
                settings.siteMode === opt.value
                  ? "bg-accent border-accent text-white"
                  : "border-border text-text-dim"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card-glow p-5 mt-4 grid sm:grid-cols-2 gap-4">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="text-sm text-text-dim">{f.label}</label>
            <input
              type={f.type}
              className="input w-full mt-1"
              value={settings[f.key] as string | number}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value,
                })
              }
            />
          </div>
        ))}
      </div>

      <div className="card-glow p-5 mt-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.preorderAutoFulfillEnabled}
            onChange={(e) => setSettings({ ...settings, preorderAutoFulfillEnabled: e.target.checked })}
          />
          선주문 자동 처리
        </label>
        <p className="text-xs text-text-dim mt-1">
          켜두면 노드에 자리가 나는 대로 크론이 선주문을 자동으로 서버로 생성해요. 끄면 자동으로는
          처리하지 않고, <code>/admin/preorders</code>에서 관리자가 직접 확인하고 배치해야 해요.
        </p>
      </div>

      <div className="card-glow p-5 mt-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.forcePreorderEnabled}
            onChange={(e) => setSettings({ ...settings, forcePreorderEnabled: e.target.checked })}
          />
          모든 신규 주문을 선주문으로 강제
        </label>
        <p className="text-xs text-text-dim mt-1">
          켜두면 노드 자리 여유와 상관없이 모든 신규 결제 주문이 무조건 &ldquo;선주문&rdquo;으로
          처리돼요 (즉시 서버가 만들어지지 않고 대기열에 들어감). 점검, 용량 제한, 대기 접수 등에 써요.
        </p>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={saving} className="btn-primary px-5 py-2.5">
          {saving ? "저장 중..." : "저장"}
        </button>
        {saved && <span className="text-sm text-green">저장됐어요.</span>}
      </div>
    </div>
  );
}
