"use client";

import { useEffect, useState } from "react";
import { GitBranch, Copy, Check, RefreshCw } from "lucide-react";
import Toggle from "@/components/Toggle";

interface DeployConfig {
  supportsGit: boolean;
  autoDeployEnabled: boolean;
  webhookUrl: string;
  hasSecret: boolean;
  deployWebhookSecret: string | null;
  buildCommand: string | null;
}

export default function GitDeployCard({ serverId }: { serverId: string }) {
  const [config, setConfig] = useState<DeployConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [buildCommand, setBuildCommand] = useState("");

  useEffect(() => {
    fetch(`/api/servers/${serverId}/deploy`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setConfig(data);
        setBuildCommand(data?.buildCommand ?? "");
      });
  }, [serverId]);

  async function toggle(enabled: boolean, rotateSecret = false, buildCommandOverride?: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/deploy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          rotateSecret,
          ...(buildCommandOverride !== undefined ? { buildCommand: buildCommandOverride || null } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok) setConfig((prev) => (prev ? { ...prev, ...data, hasSecret: !!data.deployWebhookSecret } : prev));
    } finally {
      setSaving(false);
    }
  }

  async function deployNow() {
    setDeploying(true);
    setDeployResult(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/deploy`, { method: "POST" });
      const data = await res.json();
      setDeployResult(data.ok ? "배포 완료! 콘솔 탭에서 로그를 확인하세요." : `배포 중 문제가 있었어요: ${data.output?.slice(0, 200) ?? data.error}`);
    } catch {
      setDeployResult("배포 요청에 실패했어요.");
    } finally {
      setDeploying(false);
    }
  }

  function copy(key: string, value: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
    });
  }

  if (!config || !config.supportsGit) return null;

  return (
    <div className="card-glow p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
            <GitBranch size={15} className="text-accent" />
          </span>
          <div>
            <h3 className="font-semibold text-sm">Git 자동 배포</h3>
            <p className="text-xs text-text-dim">GitHub에 push하면 자동으로 git pull + 재시작해요.</p>
          </div>
        </div>
        <Toggle checked={config.autoDeployEnabled} onChange={(next) => toggle(next)} />
      </div>

      {config.autoDeployEnabled && config.deployWebhookSecret && (
        <div className="rounded-xl border border-border bg-surface-2/50 p-3.5 space-y-2 text-xs">
          <p className="text-text-dim">
            GitHub 저장소 → Settings → Webhooks → Add webhook에서 아래 값을 입력하세요
            (Content type: application/json).
          </p>
          <div>
            <label className="text-text-dim">Payload URL</label>
            <button
              onClick={() => copy("url", config.webhookUrl)}
              className="w-full mt-1 flex items-center justify-between gap-2 font-mono bg-surface-2 rounded-lg px-3 py-2 text-left hover:bg-surface-2/70"
            >
              <span className="truncate">{config.webhookUrl}</span>
              {copied === "url" ? <Check size={13} className="text-green shrink-0" /> : <Copy size={13} className="text-text-dim shrink-0" />}
            </button>
          </div>
          <div>
            <label className="text-text-dim">Secret</label>
            <button
              onClick={() => copy("secret", config.deployWebhookSecret!)}
              className="w-full mt-1 flex items-center justify-between gap-2 font-mono bg-surface-2 rounded-lg px-3 py-2 text-left hover:bg-surface-2/70"
            >
              <span className="truncate">{config.deployWebhookSecret}</span>
              {copied === "secret" ? <Check size={13} className="text-green shrink-0" /> : <Copy size={13} className="text-text-dim shrink-0" />}
            </button>
          </div>
          <button onClick={() => toggle(true, true)} disabled={saving} className="text-accent hover:underline">
            비밀값 재발급
          </button>

          <div className="pt-2 border-t border-border">
            <label className="text-text-dim">빌드 명령 (선택) — pull 뒤 재시작 전에 실행해요</label>
            <div className="flex gap-2 mt-1">
              <input
                className="input flex-1 font-mono text-xs"
                placeholder="예: npm install && npm run build"
                value={buildCommand}
                onChange={(e) => setBuildCommand(e.target.value)}
              />
              <button
                onClick={() => toggle(true, false, buildCommand)}
                disabled={saving}
                className="btn-secondary px-3 py-1.5 text-xs shrink-0"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={deployNow}
        disabled={deploying}
        className="btn-secondary px-3.5 py-2 text-xs inline-flex items-center gap-1.5 active:scale-95 transition-transform"
      >
        <RefreshCw size={13} className={deploying ? "animate-spin" : ""} /> {deploying ? "배포 중..." : "지금 배포"}
      </button>
      {deployResult && <p className="text-xs text-text-dim">{deployResult}</p>}
    </div>
  );
}
