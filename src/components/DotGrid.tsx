export default function DotGrid({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      aria-hidden="true"
    >
      <defs>
        <pattern id="dot-grid-pattern" width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.5" fill="var(--text-dim)" />
        </pattern>
        <radialGradient id="dot-grid-fade" cx="50%" cy="35%" r="65%">
          <stop offset="0%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id="dot-grid-mask">
          <rect width="100%" height="100%" fill="url(#dot-grid-fade)" />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="url(#dot-grid-pattern)" opacity="0.18" mask="url(#dot-grid-mask)" />
    </svg>
  );
}
