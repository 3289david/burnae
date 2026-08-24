import { GoogleLogo, GithubLogo, DiscordLogo } from "@/components/ProviderIcons";

const PROVIDERS = [
  { key: "google", label: "Google로 계속하기", Icon: GoogleLogo },
  { key: "github", label: "GitHub로 계속하기", Icon: GithubLogo },
  { key: "discord", label: "Discord로 계속하기", Icon: DiscordLogo },
] as const;

export default function OAuthButtons({ referralCode }: { referralCode?: string }) {
  return (
    <div className="space-y-2">
      {PROVIDERS.map((p) => (
        <a
          key={p.key}
          href={`/api/auth/oauth/${p.key}/start${referralCode ? `?ref=${encodeURIComponent(referralCode)}` : ""}`}
          className="btn-secondary w-full py-3 flex items-center justify-center gap-2.5 text-sm"
        >
          <p.Icon size={18} />
          {p.label}
        </a>
      ))}
    </div>
  );
}
