"use client";

import { useEffect, useRef, useState } from "react";

/** 숫자가 0(또는 이전 값)에서 목표값까지 빠르게 세어 올라가는 애니메이션 — 가격/포인트 표시용 */
export default function CountUp({
  value,
  duration = 500,
  format = (n: number) => n.toLocaleString("ko-KR"),
  className,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const prevValue = useRef(value);

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
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <span className={className}>{format(display)}</span>;
}
