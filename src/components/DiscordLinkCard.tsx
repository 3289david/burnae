import { useTranslations } from "next-intl";
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
  const t = useTranslations("discordLinkCard");
  if (linked) {
    return (
      <div className="card-glow p-5 animate-fade-up">
        <p className="font-semibold text-sm flex items-center gap-1.5"><Bot size={16} className="text-purple" /> {t("linkedTitle")}</p>
        <p className="text-xs text-text-dim mt-1">{t("linkedDesc")}</p>
        {justLinked && <p className="text-xs text-green mt-2 animate-toast-in">{t("justLinked")}</p>}
      </div>
    );
  }

  return (
    <div className="card-glow p-5 animate-fade-up">
      <p className="font-semibold text-sm flex items-center gap-1.5"><Bot size={16} className="text-purple" /> {t("title")}</p>
      <p className="text-xs text-text-dim mt-1">{t("desc")}</p>
      {SERVER_INVITE_URL && (
        <a href={SERVER_INVITE_URL} target="_blank" rel="noreferrer" className="block text-xs text-accent mt-2 hover:underline">
          {t("inviteCta")}
        </a>
      )}
      <a
        href="/api/auth/oauth/discord/start?mode=link"
        className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-sm mt-3 active:scale-95 transition-transform"
      >
        <Bot size={14} /> {t("linkCta")}
      </a>
      {error && <p className="text-sm text-red mt-2">{error}</p>}
    </div>
  );
}
