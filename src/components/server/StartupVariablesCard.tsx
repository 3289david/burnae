"use client";

import { useEffect, useState } from "react";
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
function friendlyHelp(envVariable: string): HelpInfo | null {
  const key = envVariable.toUpperCase();
  if (key.includes("DISCORD") && key.includes("TOKEN")) {
    return {
      help: "디스코드 봇 토큰이에요. 디스코드 개발자 포털에서 애플리케이션을 만들고 Bot 탭에서 발급받으세요.",
      link: { label: "발급받으러 가기", url: "https://discord.com/developers/applications" },
    };
  }
  if (["TOKEN", "BOT_TOKEN", "CLIENT_TOKEN"].includes(key)) {
    return {
      help: "이 봇의 디스코드 토큰이에요. 디스코드 개발자 포털에서 애플리케이션을 만들고 Bot 탭에서 발급받으세요.",
      link: { label: "발급받으러 가기", url: "https://discord.com/developers/applications" },
    };
  }
  if (key.includes("OWNER") && (key.includes("UID") || key.includes("ID") || key === "OWNER")) {
    return { help: "본인의 디스코드 사용자 ID예요. 디스코드 설정에서 개발자 모드를 켜고, 본인 프로필을 우클릭해 'ID 복사'로 확인하세요." };
  }
  if (key.includes("SPOTIFY")) {
    return {
      help: "Spotify 계정/API 정보예요.",
      link: { label: "Spotify 개발자 포털", url: "https://developer.spotify.com/dashboard" },
    };
  }
  if (key.includes("IMGUR")) {
    return { help: "Imgur API 키예요.", link: { label: "발급받으러 가기", url: "https://api.imgur.com/oauth2/addclient" } };
  }
  if (key.includes("YOUTUBE")) {
    return { help: "YouTube Data API 키예요.", link: { label: "Google Cloud Console", url: "https://console.cloud.google.com/apis/credentials" } };
  }
  if (key.includes("STEAM")) {
    return { help: "Steam Web API 키예요.", link: { label: "발급받으러 가기", url: "https://steamcommunity.com/dev/apikey" } };
  }
  if (key.includes("MONGO")) {
    return { help: "연결할 MongoDB 주소예요. Burnae에서 MongoDB 서버를 따로 만들었다면 그 서버의 SFTP/접속 정보를 참고해 채워주세요." };
  }
  if (key.includes("PASSWORD") || key.includes("MASTER_KEY") || key.includes("SECRET")) {
    return { help: "직접 정하는 비밀번호/키예요. 다른 곳에서 쓰지 않는 값으로 안전하게 정하면 돼요." };
  }
  return null;
}

export default function StartupVariablesCard({ serverId, templateId }: { serverId: string; templateId: string }) {
  const [variables, setVariables] = useState<StartupVariable[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [installBusy, setInstallBusy] = useState(false);
  const [installDone, setInstallDone] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

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
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(null);
    }
  }

  async function installFromRepo() {
    if (!confirm("이 저장소 코드로 설치할까요? 서버의 기존 파일 대부분이 사라지고 이 저장소 코드로 새로 설치돼요.")) return;
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
      if (!reinstallRes.ok) throw new Error((await reinstallRes.json().catch(() => ({}))).error ?? "설치 실패");
      setInstallDone(true);
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : "설치 실패");
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
      setShareError(err instanceof Error ? err.message : "공유 실패");
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
          <h3 className="font-semibold text-sm">시작 변수</h3>
          <p className="text-xs text-text-dim">봇 토큰, API 키 등 — 바꾸면 서버를 재시작해야 적용돼요.</p>
        </div>
      </div>

      {variables === null && <p className="text-sm text-text-dim">불러오는 중...</p>}

      {gitVar && (
        <div className="rounded-xl border border-border bg-surface-2/50 p-3.5 space-y-2 animate-fade-up">
          <p className="text-sm font-medium inline-flex items-center gap-1.5">
            <GitBranch size={14} /> 저장소에서 설치하기
          </p>
          <p className="text-xs text-text-dim">
            GitHub 등 코드 저장소 주소를 넣고 설치하면, 그 저장소 코드로 서버가 새로 설치돼요
            (기존 파일 대부분은 사라져요).
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              className="input flex-1 min-w-[200px] font-mono text-sm"
              placeholder="https://github.com/아이디/저장소이름"
              value={values["GIT_ADDRESS"] ?? ""}
              onChange={(e) => setValues({ ...values, GIT_ADDRESS: e.target.value })}
            />
            <button
              onClick={installFromRepo}
              disabled={installBusy || !(values["GIT_ADDRESS"] ?? "").trim()}
              className="btn-primary px-3.5 py-2 text-xs shrink-0 inline-flex items-center gap-1.5 active:scale-95 transition-transform"
            >
              <Download size={13} className={installBusy ? "animate-spin" : ""} />
              {installBusy ? "설치하는 중..." : "설치하기"}
            </button>
          </div>
          {installDone && <p className="text-xs text-green animate-toast-in">설치를 시작했어요! 콘솔 탭에서 진행 상황을 볼 수 있어요.</p>}
          {installError && <p className="text-xs text-red">{installError}</p>}
        </div>
      )}

      <div className="space-y-3">
        {editable.filter((v) => v.envVariable !== "GIT_ADDRESS").map((v, i) => {
          const info = friendlyHelp(v.envVariable);
          return (
            <div key={v.envVariable} className="space-y-1 animate-fade-up" style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}>
              <div className="flex flex-wrap items-end gap-2">
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
                프리셋으로 공유했어요{shareResult.pointsAwarded > 0 ? ` (포인트 ${shareResult.pointsAwarded}P 적립)` : ""}!
                다른 유저가 서버 만들 때 이 설정을 바로 골라 쓸 수 있어요.
              </p>
            </div>
          ) : !sharing ? (
            <button
              type="button"
              onClick={() => setSharing(true)}
              className="text-xs text-accent inline-flex items-center gap-1.5 hover:underline"
            >
              <Share2 size={13} /> 이 설정을 커뮤니티 프리셋으로 공유하기
            </button>
          ) : (
            <form onSubmit={publishPreset} className="space-y-2 animate-fade-up">
              <p className="text-xs text-text-dim">
                지금 위에 저장된 값들이 그대로 다른 유저에게 공개돼요. 접속 비밀번호류 값은 공유되지 않아요.
              </p>
              <input
                required
                maxLength={40}
                className="input w-full text-sm"
                placeholder="프리셋 이름 (예: 롤플레이용 기본 설정)"
                value={shareName}
                onChange={(e) => setShareName(e.target.value)}
              />
              <input
                maxLength={200}
                className="input w-full text-sm"
                placeholder="한 줄 설명 (선택)"
                value={shareBlurb}
                onChange={(e) => setShareBlurb(e.target.value)}
              />
              <div className="flex gap-2">
                <button type="submit" disabled={sharePosting || !shareName} className="btn-primary px-3.5 py-1.5 text-xs">
                  {sharePosting ? "공유하는 중..." : "공개하기"}
                </button>
                <button type="button" onClick={() => setSharing(false)} className="btn-secondary px-3.5 py-1.5 text-xs">
                  취소
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
