"use client";

const CONFETTI_COLORS = ["var(--accent)", "var(--purple)", "var(--pink)", "var(--lime)", "var(--cyan)", "var(--yellow)"];

/** 8개 파티클을 원형으로 흩뿌리는 좌표를 미리 계산해둔다(렌더마다 랜덤이면 리렌더 시 위치가 튀어서 고정값 사용) */
const PARTICLES = Array.from({ length: 8 }, (_, i) => {
  const angle = (i / 8) * Math.PI * 2;
  const distance = 46 + (i % 3) * 10;
  return {
    tx: Math.cos(angle) * distance,
    ty: Math.sin(angle) * distance,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  };
});

/**
 * 토스식 결제완료 체크마크 — 원이 그려지고 이어서 체크가 그려진 뒤 살짝 팝되고,
 * confetti가 있으면 작은 조각들이 사방으로 흩어진다. 순수 CSS 애니메이션이라 가볍다.
 */
export default function SuccessCheck({
  size = 72,
  confetti = false,
  className = "",
}: {
  size?: number;
  confetti?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      {confetti &&
        PARTICLES.map((p, i) => (
          <span
            key={i}
            className="animate-confetti absolute left-1/2 top-1/2 rounded-full"
            style={
              {
                width: 6,
                height: 6,
                marginLeft: -3,
                marginTop: -3,
                background: p.color,
                "--tx": `${p.tx}px`,
                "--ty": `${p.ty}px`,
              } as React.CSSProperties
            }
          />
        ))}
      <svg
        viewBox="0 0 56 56"
        width={size}
        height={size}
        className="animate-success-ring relative"
        fill="none"
      >
        <circle
          cx="28"
          cy="28"
          r="26"
          stroke="var(--green)"
          strokeWidth="3"
          className="animate-success-circle"
          strokeLinecap="round"
        />
        <path
          d="M17 29 L24.5 36.5 L39 20"
          stroke="var(--green)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-success-check"
        />
      </svg>
    </div>
  );
}
