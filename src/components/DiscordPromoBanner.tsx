"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { DiscordLogo } from "@/components/ProviderIcons";

const INVITE_URL = process.env.NEXT_PUBLIC_DISCORD_SERVER_INVITE_URL;
const DISMISSED_KEY = "burnae_dismissed_discord_banner";

/**
 * 공식 디스코드 서버 초대를 /dashboard/account 구석에 작은 글자로만 보여주던 걸 대시보드
 * 전체에서 항상 눈에 띄게 올린다 — 채팅/서버 태그/부스트로 포인트도 쌓이고, 서버 관리도 되는
 * 핵심 커뮤니티라 숨겨둘 이유가 없다. 닫으면 로컬에 기억해서 다신 안 보여준다(공지랑 같은 패턴).
 */
export default function DiscordPromoBanner({ maxWidthClass = "max-w-5xl" }: { maxWidthClass?: string }) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(DISMISSED_KEY) === "1";
  });

  if (!INVITE_URL || dismissed) return null;

  return (
    <div className={`${maxWidthClass} mx-auto px-4 sm:px-6 pt-4`}>
      <div className="animate-toast-in rounded-xl border border-purple/30 bg-purple/10 px-4 py-3 flex items-center gap-3 text-sm">
        <span className="shrink-0"><DiscordLogo size={22} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Burnae 공식 디스코드 서버에 참여하세요!</p>
          <p className="text-text-dim mt-0.5">
            채팅·서버 태그·부스트로 포인트를 모으고, 서버 시작/정지/재시작도 디스코드에서 바로 할 수 있어요.
          </p>
        </div>
        <a
          href={INVITE_URL}
          target="_blank"
          rel="noreferrer"
          className="btn-primary px-3.5 py-1.5 text-xs shrink-0 active:scale-95 transition-transform"
        >
          참여하기
        </a>
        <button
          onClick={() => {
            localStorage.setItem(DISMISSED_KEY, "1");
            setDismissed(true);
          }}
          className="text-text-dim hover:text-text shrink-0 active:scale-90 transition-transform"
          aria-label="닫기"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
