"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

const CONFETTI_COLORS = ["var(--accent)", "var(--purple)", "var(--pink)", "var(--lime)", "var(--cyan)", "var(--yellow)", "var(--green)"];

/** 렌더마다 랜덤이면 리렌더 시 위치가 튀니 고정 시드로 40개 조각의 낙하 경로를 미리 계산해둔다 */
const CONFETTI = Array.from({ length: 40 }, (_, i) => {
  const seed = i * 137.5;
  return {
    left: (seed % 100).toFixed(1),
    delay: ((i % 12) * 0.09).toFixed(2),
    duration: (2.4 + (i % 5) * 0.35).toFixed(2),
    drift: `${((i % 7) - 3) * 22}px`,
    spin: `${360 * (i % 2 === 0 ? 1 : -1) * (2 + (i % 3))}deg`,
    size: 6 + (i % 4) * 2,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    round: i % 3 === 0,
  };
});

/**
 * 서버 생성 완료·결제 완료 같은 큰 순간 전용 — 화면 전체를 덮는 축하 연출.
 * 작은 아이콘 하나로는 눈에 잘 안 띄니, 배경을 흐리고 confetti가 쏟아지고 큰 배지가 팝된다.
 * 몇 초 뒤 자동으로 닫히거나, 클릭/버튼으로 바로 닫을 수 있다.
 */
export default function FullScreenCelebration({
  title,
  subtitle,
  icon,
  onClose,
  autoCloseMs = 2600,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose: () => void;
  autoCloseMs?: number | null;
}) {
  useEffect(() => {
    if (!autoCloseMs) return;
    const t = setTimeout(onClose, autoCloseMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCloseMs]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 animate-fs-backdrop"
      onClick={onClose}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {CONFETTI.map((c, i) => (
          <span
            key={i}
            className="absolute top-0 animate-fs-confetti"
            style={
              {
                left: `${c.left}%`,
                width: c.size,
                height: c.round ? c.size : c.size * 0.4,
                background: c.color,
                borderRadius: c.round ? "9999px" : "2px",
                animationDelay: `${c.delay}s`,
                "--fs-duration": `${c.duration}s`,
                "--fs-drift": c.drift,
                "--fs-spin": c.spin,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <button
        onClick={onClose}
        className="absolute top-5 right-5 text-white/70 hover:text-white p-2 active:scale-90 transition-transform"
        aria-label="닫기"
      >
        <X size={22} />
      </button>

      <div className="relative flex flex-col items-center text-center px-6" onClick={(e) => e.stopPropagation()}>
        <div className="relative flex items-center justify-center">
          <span className="absolute w-28 h-28 rounded-full border-2 border-white/40 animate-fs-ring" />
          <span className="absolute w-28 h-28 rounded-full border-2 border-white/40 animate-fs-ring" style={{ animationDelay: "0.2s" }} />
          <span className="relative w-24 h-24 rounded-full bg-white flex items-center justify-center shadow-2xl animate-fs-badge">
            {icon}
          </span>
        </div>
        <h2 className="mt-6 text-2xl sm:text-3xl font-bold text-white animate-fs-text">{title}</h2>
        {subtitle && <p className="mt-2 text-sm sm:text-base text-white/80 max-w-sm animate-fs-text">{subtitle}</p>}
      </div>
    </div>
  );
}
