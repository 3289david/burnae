import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { ArrowUpRight } from "lucide-react";

/** 페이지 중간에 들어가는 안내 카드: 맥락에 맞는 일러스트 + 한 줄 설명 + 이동 링크 */
export default function ArtCallout({
  src, title, desc, href, cta, flip = false, className = "",
}: { src: string; title: string; desc?: string; href?: string; cta?: string; flip?: boolean; className?: string }) {
  const body = (
    <div className={`group relative overflow-hidden rounded-xl border border-border bg-surface grid sm:grid-cols-[1fr_minmax(0,42%)] ${flip ? "sm:[direction:rtl]" : ""} ${className}`}>
      <div className="p-5 sm:p-7 flex flex-col justify-center sm:[direction:ltr]">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        {desc && <p className="mt-1.5 text-sm text-text-dim leading-relaxed">{desc}</p>}
        {href && cta && (
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
            {cta} <ArrowUpRight size={15} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        )}
      </div>
      <div className="relative min-h-36 sm:min-h-full bg-[#141414] border-t sm:border-t-0 sm:border-l border-border sm:[direction:ltr]">
        <Image src={`/img/${src}.webp`} alt="" fill sizes="(min-width: 640px) 30vw, 100vw" className={`object-cover ${src.startsWith("illus-") ? "object-center" : "object-right"}`} />
      </div>
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}
