import { useTranslations } from "next-intl";
import { GoogleLogo, GithubLogo, DiscordLogo } from "@/components/ProviderIcons";

const PROVIDERS = [
  { key: "google", labelKey: "google", Icon: GoogleLogo },
  { key: "github", labelKey: "github", Icon: GithubLogo },
  { key: "discord", labelKey: "discord", Icon: DiscordLogo },
] as const;

export default function OAuthButtons({ referralCode }: { referralCode?: string }) {
  const t = useTranslations("oauthButtons");
  return (
    <div className="space-y-2">
      {PROVIDERS.map((p, i) => (
        <a
          key={p.key}
          href={`/api/auth/oauth/${p.key}/start${referralCode ? `?ref=${encodeURIComponent(referralCode)}` : ""}`}
          className="btn-secondary w-full py-3 flex items-center justify-center gap-2.5 text-sm animate-fade-up active:scale-[0.98] transition-transform"
          style={{ animationDelay: `${i * 0.06}s` }}
        >
          <p.Icon size={18} />
          {t(p.labelKey)}
        </a>
      ))}
    </div>
  );
}
