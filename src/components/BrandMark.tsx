export default function BrandMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="burnae-flame" x1="4" y1="30" x2="28" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FF3D3D" />
          <stop offset="0.55" stopColor="#FF7A1A" />
          <stop offset="1" stopColor="#FFC93D" />
        </linearGradient>
      </defs>
      <path
        d="M16.4 1.5c.9 3.4-.6 5.6-2.4 7.7-2 2.3-4.2 4.8-4.2 8.9 0 1 .15 1.95.4 2.83A7.3 7.3 0 0 1 8 16.4c-2.7 2.4-4 5.6-4 8.7C4 30.1 9.4 30.5 16 30.5s12-2.9 12-8.6c0-5.1-3.1-8.3-5.2-10.9-.6 2-2 3.2-3.3 3.2-1.6 0-2.6-1.4-2.2-3.4.5-2.5 1.8-4.3 1.8-7.1 0-1-.2-1.9-.7-2.9-.7-1.4-2-2.1-2-.3Z"
        fill="url(#burnae-flame)"
      />
    </svg>
  );
}
