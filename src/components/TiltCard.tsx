"use client";

import { useRef } from "react";

/** 마우스를 따라 기울어지는 카드(터치/모션 줄이기 설정에선 정지) + 빛 반사 */
export default function TiltCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);

  function move(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.transform = `perspective(1100px) rotateX(${(0.5 - py) * 9}deg) rotateY(${(px - 0.5) * 11}deg) translateZ(0)`;
      el.style.setProperty("--mx", `${px * 100}%`);
      el.style.setProperty("--my", `${py * 100}%`);
    });
  }

  function leave() {
    const el = ref.current;
    if (!el) return;
    if (raf.current) cancelAnimationFrame(raf.current);
    el.style.transform = "perspective(1100px) rotateX(0) rotateY(0)";
  }

  return (
    <div className="group [perspective:1100px]" onPointerMove={move} onPointerLeave={leave}>
      <div
        ref={ref}
        className={`relative transition-transform duration-200 ease-out will-change-transform motion-reduce:!transform-none ${className}`}
      >
        {children}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity group-hover:opacity-100"
          style={{ background: "radial-gradient(420px circle at var(--mx,50%) var(--my,50%), rgba(255,255,255,.07), transparent 60%)" }}
        />
      </div>
    </div>
  );
}
