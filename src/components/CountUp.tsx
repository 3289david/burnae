"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 숫자가 0(또는 이전 값)에서 목표값까지 빠르게 세어 올라가는 애니메이션 — 가격/포인트/통계 표시용.
 * startFromZero가 true(기본)면 처음 나타날 때도 0부터 세어 올라간다 — 서버에서 이미 계산된 정적인
 * 숫자(통계 페이지, 가격표 등)도 화면에 나타나는 순간 애니메이션이 재생되게 하기 위함.
 */
export default function CountUp({
  value,
  duration = 700,
  format = (n: number) => Math.round(n).toLocaleString("ko-KR"),
  className,
  startFromZero = true,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
  startFromZero?: boolean;
}) {
  const [display, setDisplay] = useState(startFromZero ? 0 : value);
  const prevValue = useRef(startFromZero ? 0 : value);

  useEffect(() => {
    const from = prevValue.current;
    const to = value;
    if (from === to) return;
    prevValue.current = to;

    const start = performance.now();
    let frame: number;
    function tick(now: number) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(progress >= 1 ? to : from + (to - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <span className={className}>{format(display)}</span>;
}
