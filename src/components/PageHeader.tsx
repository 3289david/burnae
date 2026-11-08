import Image from "next/image";

export type HeaderArt = "servers" | "new" | "promo" | "shop" | "community" | "billing" | "support" | "account" | "admin";

/** 페이지 제목: 작은 일러스트 아이콘 + 제목 + 한 줄 설명 (큰 일러스트는 페이지 중간 ArtCallout에서) */
export default function PageHeader({
  art, title, desc, children, className = "",
}: { art: HeaderArt; title: React.ReactNode; desc?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <header className={`flex flex-wrap items-center gap-x-4 gap-y-4 ${className}`}>
      <div className="relative shrink-0 w-14 h-14 sm:w-16 sm:h-16 overflow-hidden rounded-xl border border-border bg-[#141414]">
        <Image src={`/img/head-${art}.webp`} alt="" fill sizes="64px" className="object-cover object-right" />
      </div>
      <div className="min-w-0 flex-1 basis-56">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-tight">{title}</h1>
        {desc && <p className="mt-1 text-sm text-text-dim leading-relaxed">{desc}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </header>
  );
}
