"use client";

/** 토스식 스위치 토글 — 원이 옆으로 미끄러지듯 이동하는 애니메이션 */
export default function Toggle({
  checked,
  onChange,
  disabled = false,
  size = "md",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const dims = size === "sm" ? { w: 34, h: 20, knob: 16 } : { w: 42, h: 24, knob: 20 };
  const padding = (dims.h - dims.knob) / 2;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative shrink-0 rounded-full transition-colors duration-200 ease-out disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        width: dims.w,
        height: dims.h,
        background: checked ? "var(--accent)" : "var(--border)",
      }}
    >
      <span
        className="absolute top-1/2 rounded-full bg-white shadow-sm transition-[left] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
        style={{
          width: dims.knob,
          height: dims.knob,
          left: checked ? dims.w - dims.knob - padding : padding,
          transform: "translateY(-50%)",
        }}
      />
    </button>
  );
}
