"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { KeyRound, Share2, GitBranch, Download } from "lucide-react";
import SuccessCheck from "@/components/SuccessCheck";

interface StartupVariable {
  name: string;
  description: string;
  envVariable: string;
  serverValue: string;
  isEditable: boolean;
  rules: string;
}

interface HelpInfo {
  help: string;
  link?: { label: string; url: string };
}

/** 코딩/서버를 몰라도 "이게 뭔지, 어디서 구하는지" 알 수 있게 흔한 변수 이름 패턴에 쉬운 설명을 붙여준다 */
function friendlyHelp(envVariable: string, t: ReturnType<typeof useTranslations<"startupVariablesCard">>): HelpInfo | null {
  const key = envVariable.toUpperCase();
  if (key.includes("DISCORD") && key.includes("TOKEN")) {
    return {
      help: t("discordTokenHelp"),
      link: { label: t("getTokenLink"), url: "https://discord.com/developers/applications" },
    };
  }
  if (["TOKEN", "BOT_TOKEN", "CLIENT_TOKEN"].includes(key)) {
    return {
      help: t("botTokenHelp"),
      link: { label: t("getTokenLink"), url: "https://discord.com/developers/applications" },
    };
  }
  if (key.includes("OWNER") && (key.includes("UID") || key.includes("ID") || key === "OWNER")) {
    return { help: t("ownerIdHelp") };
  }
  if (key.includes("SPOTIFY")) {
    return {
      help: t("spotifyHelp"),
      link: { label: t("spotifyLink"), url: "https://developer.spotify.com/dashboard" },
    };
  }
  if (key.includes("IMGUR")) {
    return { help: t("imgurHelp"), link: { label: t("getTokenLink"), url: "https://api.imgur.com/oauth2/addclient" } };
  }
  if (key.includes("YOUTUBE")) {
    return { help: t("youtubeHelp"), link: { label: t("youtubeLink"), url: "https://console.cloud.google.com/apis/credentials" } };
  }
  if (key.includes("STEAM")) {
    return { help: t("steamHelp"), link: { label: t("getTokenLink"), url: "https://steamcommunity.com/dev/apikey" } };
  }
  if (key.includes("MONGO")) {
    return { help: t("mongoHelp") };
  }
  if (key.includes("PASSWORD") || key.includes("MASTER_KEY") || key.includes("SECRET")) {
    return { help: t("passwordHelp") };
  }
  return null;
}

export default function StartupVariablesCard({ serverId, templateId }: { serverId: string; templateId: string }) {
  const t = useTranslations("startupVariablesCard");
  const [variables, setVariables] = useState<StartupVariable[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [installBusy, setInstallBusy] = useState(false);
  const [installDone, setInstallDone] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const [sharing, setSharing] = useState(false);
  const [shareName, setShareName] = useState("");
  const [shareBlurb, setShareBlurb] = useState("");
  const [sharePosting, setSharePosting] = useState(false);
  const [shareResult, setShareResult] = useState<{ pointsAwarded: number } | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

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
      setError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(null);
    }
  }

  /** .env 형식 텍스트를 붙여넣어 한 번에 여러 변수를 채운다 — 이미 아는(편집 가능한) 키만 반영한다 */
  async function saveBulk(editableKeys: Set<string>) {
    setBulkSaving(true);
    setBulkError(null);
    try {
      const parsed: Record<string, string> = {};
      for (const line of bulkText.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        let value = trimmed.slice(idx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (editableKeys.has(key)) parsed[key] = value;
      }
      if (Object.keys(parsed).length === 0) {
        throw new Error(t("noVariablesDetected"));
      }
      for (const [key, value] of Object.entries(parsed)) {
        const res = await fetch(`/api/servers/${serverId}/startup`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? t("keySaveFailed", { key }));
      }
      setValues((prev) => ({ ...prev, ...parsed }));
      setBulkText("");
      setBulkOpen(false);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : t("bulkSaveFailed"));
    } finally {
      setBulkSaving(false);
    }
  }

  function toggleReveal(key: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function installFromRepo() {
    if (!confirm(t("installConfirm"))) return;
    setInstallBusy(true);
    setInstallError(null);
    setInstallDone(false);
    try {
      const saveRes = await fetch(`/api/servers/${serverId}/startup`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "GIT_ADDRESS", value: values["GIT_ADDRESS"] ?? "" }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error);
      const reinstallRes = await fetch(`/api/servers/${serverId}/reinstall`, { method: "POST" });
      if (!reinstallRes.ok) throw new Error((await reinstallRes.json().catch(() => ({}))).error ?? t("installFailed"));
      setInstallDone(true);
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : t("installFailed"));
    } finally {
      setInstallBusy(false);
    }
  }

  async function publishPreset(e: React.FormEvent) {
    e.preventDefault();
    setSharePosting(true);
    setShareError(null);
    try {
      const environment = Object.fromEntries(editable.map((v) => [v.envVariable, values[v.envVariable] ?? ""]));
      const res = await fetch("/api/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseTemplateId: templateId, displayName: shareName, blurb: shareBlurb || undefined, environment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShareResult({ pointsAwarded: data.pointsAwarded });
      setShareName("");
      setShareBlurb("");
    } catch (err) {
      setShareError(err instanceof Error ? err.message : t("publishFailed"));
    } finally {
      setSharePosting(false);
    }
  }

  const editable = variables?.filter((v) => v.isEditable) ?? [];
  const gitVar = editable.find((v) => v.envVariable === "GIT_ADDRESS");
  if (variables !== null && editable.length === 0) return null;

  return (
    <div className="card-glow p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
          <KeyRound size={15} className="text-accent" />
        </span>
        <div>
          <h3 className="font-semibold text-sm">{t("title")}</h3>
          <p className="text-xs text-text-dim">{t("desc")}</p>
        </div>
      </div>

      {variables === null && <p className="text-sm text-text-dim">{t("loading")}</p>}

      {gitVar && (
        <div className="rounded-xl border border-border bg-surface-2/50 p-3.5 space-y-2 animate-fade-up">
          <p className="text-sm font-medium inline-flex items-center gap-1.5">
            <GitBranch size={14} /> {t("gitInstallTitle")}
          </p>
          <p className="text-xs text-text-dim">{t("gitInstallDesc")}</p>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              className="input flex-1 min-w-[200px] font-mono text-sm"
              placeholder={t("repoPlaceholder")}
              value={values["GIT_ADDRESS"] ?? ""}
              onChange={(e) => setValues({ ...values, GIT_ADDRESS: e.target.value })}
            />
            <button
              onClick={installFromRepo}
              disabled={installBusy || !(values["GIT_ADDRESS"] ?? "").trim()}
              className="btn-primary px-3.5 py-2 text-xs shrink-0 inline-flex items-center gap-1.5 active:scale-95 transition-transform"
            >
              <Download size={13} className={installBusy ? "animate-spin" : ""} />
              {installBusy ? t("installing") : t("installButton")}
            </button>
          </div>
          {installDone && <p className="text-xs text-green animate-toast-in">{t("installStartedMsg")}</p>}
          {installError && <p className="text-xs text-red">{installError}</p>}
        </div>
      )}

      {editable.length > 1 && (
        <div className="pt-1">
          <button type="button" onClick={() => setBulkOpen((v) => !v)} className="text-xs text-accent hover:underline">
            {bulkOpen ? t("closeBulkPaste") : t("bulkPasteButton")}
          </button>
          {bulkOpen && (
            <div className="mt-2 space-y-2 animate-fade-up">
              <textarea
                className="input w-full font-mono text-xs"
                rows={4}
                placeholder={t("bulkPlaceholder")}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
              />
              <button
                onClick={() => saveBulk(new Set(editable.map((v) => v.envVariable)))}
                disabled={bulkSaving || !bulkText.trim()}
                className="btn-secondary px-3.5 py-1.5 text-xs"
              >
                {bulkSaving ? t("bulkSaving") : t("bulkSaveButton")}
              </button>
              {bulkError && <p className="text-xs text-red">{bulkError}</p>}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        {editable.filter((v) => v.envVariable !== "GIT_ADDRESS").map((v, i) => {
          const info = friendlyHelp(v.envVariable, t);
          const isSecret = /PASSWORD|SECRET|TOKEN|KEY/i.test(v.envVariable);
          const masked = isSecret && !revealed.has(v.envVariable);
          return (
            <div key={v.envVariable} className="space-y-1 animate-fade-up" style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[180px] relative">
                  <label className="text-xs text-text-dim">{v.name} <span className="font-mono">({v.envVariable})</span></label>
                  <input
                    type={masked ? "password" : "text"}
                    className="input w-full mt-1 font-mono text-sm pr-14"
                    value={values[v.envVariable] ?? ""}
                    onChange={(e) => setValues({ ...values, [v.envVariable]: e.target.value })}
                  />
                  {isSecret && (
                    <button
                      type="button"
                      onClick={() => toggleReveal(v.envVariable)}
                      className="absolute right-2 bottom-2 text-[10px] text-text-dim hover:text-text px-1.5 py-1"
                    >
                      {masked ? t("reveal") : t("hide")}
                    </button>
                  )}
                </div>
                <button
                  onClick={() => save(v.envVariable)}
                  disabled={saving !== null}
                  className="btn-secondary px-3.5 py-2 text-xs shrink-0"
                >
                  {saving === v.envVariable ? t("saving") : saved === v.envVariable ? t("saved") : t("save")}
                </button>
              </div>
              {info && (
                <p className="text-[11px] text-text-dim">
                  {info.help}{" "}
                  {info.link && (
                    <a href={info.link.url} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                      {info.link.label}
                    </a>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="text-xs text-red">{error}</p>}

      {editable.length > 0 && (
        <div className="pt-3 border-t border-border">
          {shareResult ? (
            <div className="flex items-center gap-2 animate-toast-in">
              <SuccessCheck size={22} className="shrink-0" />
              <p className="text-xs text-green">
                {t("sharedMsg", {
                  pointsNote: shareResult.pointsAwarded > 0 ? t("sharedPointsNote", { amount: shareResult.pointsAwarded }) : "",
                })}
              </p>
            </div>
          ) : !sharing ? (
            <button
              type="button"
              onClick={() => setSharing(true)}
              className="text-xs text-accent inline-flex items-center gap-1.5 hover:underline"
            >
              <Share2 size={13} /> {t("shareAsPreset")}
            </button>
          ) : (
            <form onSubmit={publishPreset} className="space-y-2 animate-fade-up">
              <p className="text-xs text-text-dim">{t("shareWarning")}</p>
              <input
                required
                maxLength={40}
                className="input w-full text-sm"
                placeholder={t("presetNamePlaceholder")}
                value={shareName}
                onChange={(e) => setShareName(e.target.value)}
              />
              <input
                maxLength={200}
                className="input w-full text-sm"
                placeholder={t("presetDescPlaceholder")}
                value={shareBlurb}
                onChange={(e) => setShareBlurb(e.target.value)}
              />
              <div className="flex gap-2">
                <button type="submit" disabled={sharePosting || !shareName} className="btn-primary px-3.5 py-1.5 text-xs">
                  {sharePosting ? t("sharing") : t("publish")}
                </button>
                <button type="button" onClick={() => setSharing(false)} className="btn-secondary px-3.5 py-1.5 text-xs">
                  {t("cancel")}
                </button>
              </div>
              {shareError && <p className="text-xs text-red">{shareError}</p>}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
