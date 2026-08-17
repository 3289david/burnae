"use client";

import { useState } from "react";
import { Bot } from "lucide-react";

const SERVER_INVITE_URL = process.env.NEXT_PUBLIC_DISCORD_SERVER_INVITE_URL;

export default function DiscordLinkCard({ linked }: { linked: boolean }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function issueCode() {
    setError(null);
    const res = await fetch("/api/discord/link-code", { method: "POST" });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setCode(data.code);
  }

  if (linked) {
    return (
      <div className="card p-5">
        <p className="font-semibold text-sm flex items-center gap-1.5"><Bot size={16} className="text-purple" /> 디스코드 연동됨</p>
        <p className="text-xs text-text-dim mt-1">
          Burnae 공식 디스코드 서버에서 /서버목록, /상태 명령어를 쓸 수 있어요.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <p className="font-semibold text-sm flex items-center gap-1.5"><Bot size={16} className="text-purple" /> 디스코드 연동</p>
      <p className="text-xs text-text-dim mt-1">
        Burnae 공식 디스코드 서버에서 봇으로 서버 상태 확인, 알림을 받으려면 연동하세요.
      </p>
      {SERVER_INVITE_URL && (
        <a href={SERVER_INVITE_URL} target="_blank" rel="noreferrer" className="block text-xs text-accent mt-2">
          아직 서버에 없다면 Burnae 공식 디스코드 참여하기 →
        </a>
      )}
      {code ? (
        <div className="mt-3">
          <p className="text-xs text-text-dim">공식 서버의 아무 채널에서 아래 명령어를 입력하세요 (10분 이내):</p>
          <p className="font-mono text-accent mt-1">/link {code}</p>
        </div>
      ) : (
        <button onClick={issueCode} className="btn-primary px-4 py-2 text-sm mt-3">연동 코드 발급</button>
      )}
      {error && <p className="text-sm text-red mt-2">{error}</p>}
    </div>
  );
}
