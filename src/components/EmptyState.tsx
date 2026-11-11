import Image from "next/image";

type Art = "empty-server" | "empty-list" | "empty-receipt" | "404" | "error" | "search";

/** 비어 있는 화면/오류 화면 공용 — 일러스트 + 한 줄 안내 + (선택) 버튼 */
export default function EmptyState({
  art = "empty-list", title, desc, compact = false, children,
}: { art?: Art; title: string; desc?: string; compact?: boolean; children?: React.ReactNode }) {
  const size = compact ? 72 : 200;
  return (
    <div className={`flex ${compact ? "items-center gap-4 py-3" : "flex-col items-center text-center py-12 sm:py-16"}`}>
      <div className="relative shrink-0 overflow-hidden rounded-xl bg-[#141414] border border-border" style={{ width: size, height: Math.round(size * 0.75) }}>
        <Image src={`/img/illus-${art}.webp`} alt="" fill quality={95} sizes={`${size}px`} className="object-cover" />
      </div>
      <div className={compact ? "" : "mt-6"}>
        <p className={compact ? "text-sm text-text-dim" : "text-lg font-semibold"}>{title}</p>
        {desc && <p className="mt-1.5 text-sm text-text-dim max-w-sm mx-auto">{desc}</p>}
        {children && <div className="mt-5">{children}</div>}
      </div>
    </div>
  );
}
