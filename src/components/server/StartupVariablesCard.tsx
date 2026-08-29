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

      <div className="space-y-3">
        {editable.map((v) => {
          const info = friendlyHelp(v.envVariable);
          return (
            <div key={v.envVariable} className="space-y-1">
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
    </div>
  );
}
