export default function EmptyServerIllustration({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="esi-flame" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--flame-1)" />
          <stop offset="0.55" stopColor="var(--flame-2)" />
          <stop offset="1" stopColor="var(--flame-3)" />
        </linearGradient>
        <linearGradient id="esi-purple" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--purple)" />
          <stop offset="1" stopColor="var(--pink)" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="52" fill="url(#esi-flame)" opacity="0.08" />
      <rect x="32" y="46" width="56" height="16" rx="6" fill="var(--surface-2)" stroke="var(--border)" />
      <circle cx="42" cy="54" r="2.5" fill="url(#esi-flame)" />
      <rect x="50" y="52" width="18" height="4" rx="2" fill="var(--border)" />
      <rect x="32" y="66" width="56" height="16" rx="6" fill="var(--surface-2)" stroke="var(--border)" />
      <circle cx="42" cy="74" r="2.5" fill="url(#esi-purple)" />
      <rect x="50" y="72" width="14" height="4" rx="2" fill="var(--border)" />
      <path d="M60 22v14M53 29l7-7 7 7" stroke="url(#esi-flame)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
