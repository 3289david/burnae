"use client";

import { useEffect, useState } from "react";

interface Template {
  id: string;
  key: string;
  displayName: string;
  pterodactylNestId: number;
  pterodactylEggId: number;
  dockerImage: string;
  startupCommand: string;
  minecraftVersions: string[];
  active: boolean;
}

const empty = {
  key: "",
  displayName: "",
  pterodactylNestId: 1,
  pterodactylEggId: 1,
  dockerImage: "ghcr.io/pterodactyl/yolks:java_21",
  startupCommand: 'java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar server.jar nogui',
  minecraftVersionsText: "1.21.1, 1.20.4",
  environmentText: "SERVER_JARFILE=server.jar",
};

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/templates");
    setTemplates(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const environment: Record<string, string> = {};
      for (const pair of form.environmentText.split(",")) {
        const [k, v] = pair.split("=");
        if (k && v) environment[k.trim()] = v.trim();
      }
      const res = await fetch("/api/admin/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: form.key,
          displayName: form.displayName,
          pterodactylNestId: Number(form.pterodactylNestId),
          pterodactylEggId: Number(form.pterodactylEggId),
          dockerImage: form.dockerImage,
          startupCommand: form.startupCommand,
          minecraftVersions: form.minecraftVersionsText.split(",").map((v) => v.trim()).filter(Boolean),
          defaultEnvironment: environment,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm(empty);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "생성 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">서버 종류 (Egg)</h1>
      <p className="text-sm text-text-dim mt-1">
        Pterodactyl 패널의 Nests → Eggs 화면에서 Paper/Fabric/Forge 등의 Nest ID, Egg ID를 확인해 입력하세요.
      </p>

      <div className="mt-6 space-y-2">
        {templates.map((t) => (
          <div key={t.id} className="card p-4 text-sm">
            <div className="flex justify-between">
              <span className="font-medium">{t.displayName} <span className="text-text-dim">({t.key})</span></span>
              <span className="text-text-dim">{t.active ? "활성" : "비활성"}</span>
            </div>
            <p className="text-text-dim text-xs mt-1">Nest #{t.pterodactylNestId} / Egg #{t.pterodactylEggId} · {t.dockerImage}</p>
            <p className="text-text-dim text-xs">버전: {t.minecraftVersions.join(", ")}</p>
          </div>
        ))}
      </div>

      <form onSubmit={create} className="card p-5 mt-6 space-y-3">
        <h2 className="font-semibold">새 서버 종류 추가</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="키 (예: paper)" value={form.key} onChange={(v) => setForm({ ...form, key: v })} />
          <Field label="표시 이름 (예: Paper)" value={form.displayName} onChange={(v) => setForm({ ...form, displayName: v })} />
          <Field label="Nest ID" value={form.pterodactylNestId} onChange={(v) => setForm({ ...form, pterodactylNestId: Number(v) || 0 })} />
          <Field label="Egg ID" value={form.pterodactylEggId} onChange={(v) => setForm({ ...form, pterodactylEggId: Number(v) || 0 })} />
          <Field label="Docker 이미지" value={form.dockerImage} onChange={(v) => setForm({ ...form, dockerImage: v })} className="sm:col-span-2" />
          <Field label="시작 명령어" value={form.startupCommand} onChange={(v) => setForm({ ...form, startupCommand: v })} className="sm:col-span-2" />
          <Field label="지원 버전 (쉼표 구분)" value={form.minecraftVersionsText} onChange={(v) => setForm({ ...form, minecraftVersionsText: v })} className="sm:col-span-2" />
          <Field label="기본 환경변수 (KEY=VALUE, 쉼표 구분)" value={form.environmentText} onChange={(v) => setForm({ ...form, environmentText: v })} className="sm:col-span-2" />
        </div>
        {error && <p className="text-sm text-red">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary px-5 py-2.5">추가</button>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, className }: { label: string; value: string | number; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={className}>
      <label className="text-sm text-text-dim">{label}</label>
      <input className="input w-full mt-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
