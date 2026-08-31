import { Bot } from "lucide-react";

const SERVER_INVITE_URL = process.env.NEXT_PUBLIC_DISCORD_SERVER_INVITE_URL;

export default function DiscordLinkCard({
  linked,
  error,
  justLinked,
}: {
  linked: boolean;
  error?: string;
  justLinked?: boolean;
}) {
  if (linked) {
    return (
      <div className="card-glow p-5 animate-fade-up">
        <p className="font-semibold text-sm flex items-center gap-1.5"><Bot size={16} className="text-purple" /> 디스코드 연동됨</p>
        <p className="text-xs text-text-dim mt-1">
          Burnae 공식 디스코드 서버에서 /서버목록, /상태 명령어를 쓸 수 있어요.
        </p>
        {justLinked && <p className="text-xs text-green mt-2 animate-toast-in">방금 연동이 완료됐어요.</p>}
      </div>
    );
  }

  return (
    <div className="card-glow p-5 animate-fade-up">
      <p className="font-semibold text-sm flex items-center gap-1.5"><Bot size={16} className="text-purple" /> 디스코드 연동</p>
      <p className="text-xs text-text-dim mt-1">
        디스코드 계정으로 로그인하면 자동으로 연동돼요. Burnae 공식 디스코드 서버에서 봇으로 서버 상태 확인, 알림을 받을 수 있어요.
      </p>
      {SERVER_INVITE_URL && (
        <a href={SERVER_INVITE_URL} target="_blank" rel="noreferrer" className="block text-xs text-accent mt-2 hover:underline">
          아직 서버에 없다면 Burnae 공식 디스코드 참여하기 →
        </a>
      )}
      <a
        href="/api/auth/oauth/discord/start?mode=link"
        className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-sm mt-3 active:scale-95 transition-transform"
      >
        <Bot size={14} /> 디스코드 계정 연동하기
      </a>
      {error && <p className="text-sm text-red mt-2">{error}</p>}
    </div>
  );
}
