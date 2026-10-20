"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { GitBranch, Copy, Check, RefreshCw, Lock, Unlink } from "lucide-react";
import Toggle from "@/components/Toggle";
import { GithubLogo } from "@/components/ProviderIcons";

interface DeployConfig {
  supportsGit: boolean;
  autoDeployEnabled: boolean;
  webhookUrl: string;
  hasSecret: boolean;
  deployWebhookSecret: string | null;
  buildCommand: string | null;
  currentRepoUrl: string | null;
  githubLogin: string | null;
  gitBranch: string | null;
  deployNotifyWebhookUrl: string | null;
  gitDeployHidden: boolean;
}

interface GithubRepoSummary {
  fullName: string;
  cloneUrl: string;
  private: boolean;
  updatedAt: string;
}

export default function GitDeployCard({ serverId }: { serverId: string }) {
  const t = useTranslations("gitDeployCard");
  const [config, setConfig] = useState<DeployConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [buildCommand, setBuildCommand] = useState("");
  const [gitBranch, setGitBranch] = useState("");
  const [notifyWebhookUrl, setNotifyWebhookUrl] = useState("");
  const [editingRepo, setEditingRepo] = useState(false);
  const [repoMode, setRepoMode] = useState<"github" | "manual">("github");
  const [githubRepos, setGithubRepos] = useState<GithubRepoSummary[] | null>(null);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [repoToken, setRepoToken] = useState("");
  const [repoBusy, setRepoBusy] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [testWebhookResult, setTestWebhookResult] = useState<"ok" | "error" | null>(null);

  function load() {
    fetch(`/api/servers/${serverId}/deploy`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setConfig(data);
        setBuildCommand(data?.buildCommand ?? "");
        setGitBranch(data?.gitBranch ?? "");
        setNotifyWebhookUrl(data?.deployNotifyWebhookUrl ?? "");
        setRepoMode(data?.githubLogin ? "github" : "manual");
      });
  }
  useEffect(load, [serverId]);

  useEffect(() => {
    if (!editingRepo || repoMode !== "github" || !config?.githubLogin || githubRepos) return;
    fetch("/api/github/repos")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setGithubRepos(data.repos));
  }, [editingRepo, repoMode, config?.githubLogin, githubRepos]);

  async function toggle(
    enabled: boolean,
    rotateSecret = false,
    buildCommandOverride?: string,
    gitBranchOverride?: string,
    notifyWebhookOverride?: string,
  ) {
    setSaving(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/deploy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          rotateSecret,
          ...(buildCommandOverride !== undefined ? { buildCommand: buildCommandOverride || null } : {}),
          ...(gitBranchOverride !== undefined ? { gitBranch: gitBranchOverride || null } : {}),
          ...(notifyWebhookOverride !== undefined ? { deployNotifyWebhookUrl: notifyWebhookOverride || null } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok) setConfig((prev) => (prev ? { ...prev, ...data, hasSecret: !!data.deployWebhookSecret } : prev));
    } finally {
      setSaving(false);
    }
  }

  async function setHidden(hidden: boolean) {
    setSaving(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/deploy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gitDeployHidden: hidden }),
      });
      const data = await res.json();
      if (res.ok) setConfig((prev) => (prev ? { ...prev, ...data } : prev));
    } finally {
      setSaving(false);
    }
  }

  async function sendTestWebhook() {
    setTestingWebhook(true);
    setTestWebhookResult(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/notify-webhook/test`, { method: "POST" });
      setTestWebhookResult(res.ok ? "ok" : "error");
    } catch {
      setTestWebhookResult("error");
    } finally {
      setTestingWebhook(false);
      setTimeout(() => setTestWebhookResult(null), 3000);
    }
  }

  async function deployNow() {
    setDeploying(true);
    setDeployResult(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/deploy`, { method: "POST" });
      const data = await res.json();
      setDeployResult(data.ok ? t("deployCompleteMsg") : t("deployIssueMsg", { detail: data.output?.slice(0, 200) ?? data.error }));
    } catch {
      setDeployResult(t("deployRequestFailed"));
    } finally {
      setDeploying(false);
    }
  }

  async function changeRepo(e: React.FormEvent) {
    e.preventDefault();
    setRepoBusy(true);
    setRepoError(null);
    try {
      const body =
        repoMode === "github"
          ? { url: selectedRepo, useConnectedGithub: true }
          : { url: repoUrl, token: repoToken || undefined };
      const res = await fetch(`/api/servers/${serverId}/git-remote`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDeployResult(data.ok ? t("repoChangedMsg") : t("repoChangeIssueMsg", { detail: data.output?.slice(0, 200) ?? "" }));
      setEditingRepo(false);
      setRepoUrl("");
      setRepoToken("");
      setSelectedRepo("");
      load();
    } catch (err) {
      setRepoError(err instanceof Error ? err.message : t("changeFailed"));
    } finally {
      setRepoBusy(false);
    }
  }

  async function disconnectRepo() {
    if (!confirm(t("disconnectConfirm"))) return;
    setRepoBusy(true);
    try {
      await fetch(`/api/servers/${serverId}/startup`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "GIT_ADDRESS", value: "" }),
      });
      await toggle(false);
      load();
    } finally {
      setRepoBusy(false);
    }
  }

  async function disconnectGithubAccount() {
    if (!confirm(t("disconnectGithubConfirm"))) return;
    await fetch("/api/github/repos", { method: "DELETE" });
    setGithubRepos(null);
    load();
  }

  function copy(key: string, value: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
    });
  }

  if (!config || !config.supportsGit) return null;

  if (config.gitDeployHidden) {
    return (
      <div className="card-glow p-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-text-dim">
          <GitBranch size={15} />
          {t("hiddenNotice")}
        </div>
        <button onClick={() => setHidden(false)} disabled={saving} className="text-accent text-xs hover:underline shrink-0">
          {t("unhide")}
        </button>
      </div>
    );
  }

  return (
    <div className="card-glow p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
            <GitBranch size={15} className="text-accent" />
          </span>
          <div>
            <h3 className="font-semibold text-sm">{t("title")}</h3>
            <p className="text-xs text-text-dim">{t("desc")}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={() => setHidden(true)} disabled={saving} className="text-text-dim text-xs hover:underline">
            {t("hideCard")}
          </button>
          <Toggle checked={config.autoDeployEnabled} onChange={(next) => toggle(next)} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-2/50 p-3.5 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2">
            {config.githubLogin && (
              <span className="inline-flex items-center gap-1 text-text-dim shrink-0" title={`GitHub: @${config.githubLogin}`}>
                <GithubLogo size={13} />
              </span>
            )}
            <div className="min-w-0">
              <label className="text-text-dim">{t("connectedRepo")}</label>
              <p className="font-mono truncate mt-0.5">{config.currentRepoUrl ?? t("notConnected")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {config.currentRepoUrl && (
              <button onClick={disconnectRepo} disabled={repoBusy} title={t("disconnectTooltip")} className="text-text-dim hover:text-red">
                <Unlink size={14} />
              </button>
            )}
            <button onClick={() => setEditingRepo((v) => !v)} className="text-accent hover:underline shrink-0">
              {editingRepo ? t("cancel") : t("changeRepo")}
            </button>
          </div>
        </div>

        {editingRepo && (
          <div className="pt-2 border-t border-border space-y-2">
            {!config.githubLogin ? (
              <div className="space-y-2">
                <p className="text-text-dim font-sans">{t("connectGithubHint")}</p>
                <a
                  href={`/api/github/connect/start?serverId=${serverId}`}
                  className="btn-secondary px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5"
                >
                  <GithubLogo size={13} /> {t("connectGithub")}
                </a>
                <p className="text-text-dim font-sans pt-1">{t("orManualEntry")}</p>
                <ManualRepoForm
                  repoUrl={repoUrl}
                  setRepoUrl={setRepoUrl}
                  repoToken={repoToken}
                  setRepoToken={setRepoToken}
                  onSubmit={(e) => {
                    setRepoMode("manual");
                    changeRepo(e);
                  }}
                  busy={repoBusy}
                  error={repoError}
                  t={t}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-text-dim font-sans">{t("githubAccountRepos", { login: config.githubLogin })}</p>
                  <button onClick={disconnectGithubAccount} className="text-text-dim hover:text-red shrink-0">
                    {t("disconnectGithubAccount")}
                  </button>
                </div>
                <form
                  onSubmit={(e) => {
                    setRepoMode("github");
                    changeRepo(e);
                  }}
                  className="space-y-2"
                >
                  <select
                    className="input w-full text-xs"
                    value={selectedRepo}
                    onChange={(e) => setSelectedRepo(e.target.value)}
                    required
                  >
                    <option value="">{t("selectRepoPlaceholder")}</option>
                    {githubRepos === null && <option disabled>{t("loadingRepos")}</option>}
                    {githubRepos?.map((r) => (
                      <option key={r.fullName} value={r.cloneUrl}>
                        {r.fullName}
                        {r.private ? t("privateSuffix") : ""}
                      </option>
                    ))}
                  </select>
                  <button type="submit" disabled={repoBusy || !selectedRepo} className="btn-primary px-3.5 py-1.5 text-xs">
                    {repoBusy ? t("changing") : t("changeToThisRepo")}
                  </button>
                  {repoError && <p className="text-red">{repoError}</p>}
                </form>
                <details className="pt-1">
                  <summary className="text-text-dim cursor-pointer">{t("otherHostDetails")}</summary>
                  <div className="mt-2">
                    <ManualRepoForm
                      repoUrl={repoUrl}
                      setRepoUrl={setRepoUrl}
                      repoToken={repoToken}
                      setRepoToken={setRepoToken}
                      onSubmit={(e) => {
                        setRepoMode("manual");
                        changeRepo(e);
                      }}
                      busy={repoBusy}
                      error={repoError}
                      t={t}
                    />
                  </div>
                </details>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface-2/50 p-3.5 space-y-3 text-xs">
        <div>
          <label className="text-text-dim">{t("branchLabel")}</label>
          <div className="flex gap-2 mt-1">
            <input
              className="input flex-1 font-mono text-xs"
              placeholder={t("branchPlaceholder")}
              value={gitBranch}
              onChange={(e) => setGitBranch(e.target.value)}
            />
            <button
              onClick={() => toggle(config.autoDeployEnabled, false, undefined, gitBranch)}
              disabled={saving}
              className="btn-secondary px-3 py-1.5 text-xs shrink-0"
            >
              {t("save")}
            </button>
          </div>
        </div>
        <div>
          <label className="text-text-dim">{t("notifyWebhookLabel")}</label>
          <div className="flex gap-2 mt-1">
            <input
              className="input flex-1 font-mono text-xs"
              placeholder={t("notifyWebhookPlaceholder")}
              value={notifyWebhookUrl}
              onChange={(e) => setNotifyWebhookUrl(e.target.value)}
            />
            <button
              onClick={() => toggle(config.autoDeployEnabled, false, undefined, undefined, notifyWebhookUrl)}
              disabled={saving}
              className="btn-secondary px-3 py-1.5 text-xs shrink-0"
            >
              {t("save")}
            </button>
            {config.deployNotifyWebhookUrl && (
              <button
                onClick={sendTestWebhook}
                disabled={testingWebhook}
                className="btn-secondary px-3 py-1.5 text-xs shrink-0"
              >
                {testingWebhook ? t("webhookTesting") : t("webhookTest")}
              </button>
            )}
          </div>
          {testWebhookResult === "ok" && <p className="text-green mt-1">{t("webhookTestOk")}</p>}
          {testWebhookResult === "error" && <p className="text-red-500 mt-1">{t("webhookTestError")}</p>}
        </div>
      </div>

      {config.autoDeployEnabled && config.deployWebhookSecret && (
        <div className="rounded-xl border border-border bg-surface-2/50 p-3.5 space-y-2 text-xs">
          <p className="text-text-dim">{t("webhookHint")}</p>
          <div>
            <label className="text-text-dim">{t("payloadUrlLabel")}</label>
            <button
              onClick={() => copy("url", config.webhookUrl)}
              className="w-full mt-1 flex items-center justify-between gap-2 font-mono bg-surface-2 rounded-lg px-3 py-2 text-left hover:bg-surface-2/70"
            >
              <span className="truncate">{config.webhookUrl}</span>
              {copied === "url" ? <Check size={13} className="text-green shrink-0" /> : <Copy size={13} className="text-text-dim shrink-0" />}
            </button>
          </div>
          <div>
            <label className="text-text-dim">{t("secretLabel")}</label>
            <button
              onClick={() => copy("secret", config.deployWebhookSecret!)}
              className="w-full mt-1 flex items-center justify-between gap-2 font-mono bg-surface-2 rounded-lg px-3 py-2 text-left hover:bg-surface-2/70"
            >
              <span className="truncate">{config.deployWebhookSecret}</span>
              {copied === "secret" ? <Check size={13} className="text-green shrink-0" /> : <Copy size={13} className="text-text-dim shrink-0" />}
            </button>
          </div>
          <button onClick={() => toggle(true, true)} disabled={saving} className="text-accent hover:underline">
            {t("regenSecret")}
          </button>

          <div className="pt-2 border-t border-border">
            <label className="text-text-dim">{t("buildCommandLabel")}</label>
            <div className="flex gap-2 mt-1">
              <input
                className="input flex-1 font-mono text-xs"
                placeholder={t("buildCommandPlaceholder")}
                value={buildCommand}
                onChange={(e) => setBuildCommand(e.target.value)}
              />
              <button
                onClick={() => toggle(true, false, buildCommand)}
                disabled={saving}
                className="btn-secondary px-3 py-1.5 text-xs shrink-0"
              >
                {t("save")}
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
        <RefreshCw size={13} className={deploying ? "animate-spin" : ""} /> {deploying ? t("deploying") : t("deployNow")}
      </button>
      {deployResult && <p className="text-xs text-text-dim">{deployResult}</p>}
    </div>
  );
}

function ManualRepoForm({
  repoUrl,
  setRepoUrl,
  repoToken,
  setRepoToken,
  onSubmit,
  busy,
  error,
  t,
}: {
  repoUrl: string;
  setRepoUrl: (v: string) => void;
  repoToken: string;
  setRepoToken: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  busy: boolean;
  error: string | null;
  t: ReturnType<typeof useTranslations<"gitDeployCard">>;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input
        type="text"
        className="input w-full font-mono text-xs"
        placeholder={t("repoPlaceholder")}
        value={repoUrl}
        onChange={(e) => setRepoUrl(e.target.value)}
        required
      />
      <div className="relative">
        <Lock size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim" />
        <input
          type="password"
          className="input w-full font-mono text-xs pl-7"
          placeholder={t("tokenPlaceholder")}
          value={repoToken}
          onChange={(e) => setRepoToken(e.target.value)}
        />
      </div>
      <button type="submit" disabled={busy} className="btn-primary px-3.5 py-1.5 text-xs">
        {busy ? t("changing") : t("changeAndRefetch")}
      </button>
      {error && <p className="text-red">{error}</p>}
    </form>
  );
}
