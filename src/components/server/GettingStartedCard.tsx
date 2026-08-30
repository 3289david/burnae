"use client";

import { useEffect, useState } from "react";
import { Compass, X } from "lucide-react";
import type { ServerInfo } from "./ServerDetailClient";

function stepsFor(server: ServerInfo): string[] {
  if (server.templateCategory === "MINECRAFT") {
    return [
      "개요 탭에서 서버를 켜고, 접속 주소를 친구에게 공유하세요.",
      "설정 탭에서 난이도·게임 모드·화이트리스트 등을 바꿀 수 있어요.",
      "플러그인 탭에서 검색만으로 플러그인을 설치할 수 있어요.",
      "AI 탭에서 \"커맨드 블럭 켜줘\"처럼 채팅으로 서버를 관리해보세요.",
    ];
  }
  if (server.templateCategory === "DISCORD_BOT") {
    return [
      "설정 탭 → 시작 변수에서 봇 토큰을 입력하고 저장하세요.",
      "토큰을 저장하면 설정 탭에 초대 링크가 자동으로 떠요 — 눌러서 내 디스코드 서버에 초대하세요.",
      "콘솔 탭에서 봇이 잘 켜졌는지 로그를 확인하세요.",
      "막히면 AI 탭에 그냥 물어보세요 — 로그를 직접 확인하고 도와줘요.",
    ];
  }
  return [
    server.accessSecret
      ? "서버 정보 카드에서 접속 비밀번호를 확인하세요."
      : "설정 탭 → 시작 변수에서 필요한 값을 입력하고 저장하세요.",
    "접속 주소로 브라우저에서 바로 들어가볼 수 있어요.",
    "설정 탭 → SFTP로 에디터·git에서 파일을 직접 다룰 수 있어요.",
    "막히면 AI 탭에 그냥 물어보세요 — 로그를 직접 확인하고 도와줘요.",
  ];
}

export default function GettingStartedCard({ server }: { server: ServerInfo }) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(`burnae-guide-dismissed-${server.id}`) === "1");
  }, [server.id]);

  if (dismissed) return null;

  function dismiss() {
    localStorage.setItem(`burnae-guide-dismissed-${server.id}`, "1");
    setDismissed(true);
  }

  return (
    <div className="card-glow p-5 space-y-2.5 border-accent/40">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
            <Compass size={15} className="text-accent" />
          </span>
          <h3 className="font-semibold text-sm">처음이신가요? 시작 가이드</h3>
        </div>
        <button onClick={dismiss} className="text-text-dim hover:text-text p-1" aria-label="닫기">
          <X size={16} />
        </button>
      </div>
      <ol className="space-y-1.5 text-sm text-text-dim list-decimal pl-5">
        {stepsFor(server).map((step, i) => (
          <li key={i} className="animate-fade-up" style={{ animationDelay: `${i * 0.06}s` }}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
