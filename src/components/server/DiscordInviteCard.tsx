"use client";

import { useEffect, useState } from "react";
import { Bot, Copy, ExternalLink, RefreshCw } from "lucide-react";

interface InviteInfo {
  clientId: string;
  appName: string;
  inviteUrl: string;
}

const HIDE_ERRORS = ["봇 토큰 항목이 없어서"];

export default function DiscordInviteCard({ serverId }: { serverId: string }) {
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/servers/${serverId}/discord-invite`);
      const data = await res.json();
      if (!res.ok) {
        if (HIDE_ERRORS.some((s) => data.error?.includes(s))) {
          setHidden(true);
        } else {
          setError(data.error ?? "초대 링크를 만들지 못했어요.");
        }
        return;
      }
      setInvite(data);
    } catch {
      setError("초대 링크를 만들지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  if (hidden) return null;

  return (
    <div className="card-glow p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
          <Bot size={15} className="text-accent" />
        </span>
        <div>
          <h3 className="font-semibold text-sm">디스코드에 봇 초대하기</h3>
          <p className="text-xs text-text-dim">클라이언트 ID를 직접 찾을 필요 없이 초대 링크를 자동으로 만들어줘요.</p>
        </div>
      </div>

      {loading && <p className="text-sm text-text-dim">확인하는 중...</p>}

      {!loading && invite && (
        <>
          <p className="text-sm">
            <strong>{invite.appName}</strong> 봇을 찾았어요. 아래 링크로 원하는 서버에 초대하세요.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={invite.inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary px-4 py-2 text-sm inline-flex items-center gap-1.5"
            >
              <ExternalLink size={14} /> 서버에 초대하기
            </a>
            <button
              onClick={() => {
                navigator.clipboard.writeText(invite.inviteUrl);
                setCopied(true);
              }}
              className="btn-secondary px-4 py-2 text-sm inline-flex items-center gap-1.5"
            >
              <Copy size={14} /> {copied ? "복사됨" : "링크 복사"}
            </button>
          </div>
          <p className="text-xs text-text-dim">
            기본적으로 관리자 권한으로 초대돼요. 필요한 권한만 따로 설정하고 싶다면 디스코드 개발자
            포털에서 직접 초대 링크를 만들어 쓰셔도 돼요.
          </p>
        </>
      )}

      {!loading && error && (
        <>
          <p className="text-sm text-yellow">{error}</p>
          <button onClick={load} className="btn-secondary px-3.5 py-2 text-xs inline-flex items-center gap-1.5">
            <RefreshCw size={13} /> 다시 확인
          </button>
        </>
      )}
    </div>
  );
}
