const PROVIDERS = [
  { key: "google", label: "Google로 계속하기", icon: "🔵" },
  { key: "github", label: "GitHub로 계속하기", icon: "⚫" },
  { key: "discord", label: "Discord로 계속하기", icon: "🟣" },
] as const;

export default function OAuthButtons() {
  return (
    <div className="space-y-2">
      {PROVIDERS.map((p) => (
        <a
          key={p.key}
          href={`/api/auth/oauth/${p.key}/start`}
          className="btn-secondary w-full py-2.5 flex items-center justify-center gap-2 text-sm"
        >
          <span>{p.icon}</span>
          {p.label}
        </a>
      ))}
    </div>
  );
}
