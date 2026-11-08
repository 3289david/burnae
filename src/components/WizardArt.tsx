import Image from "next/image";

/** 서버 만들기 마법사 오른쪽 일러스트 + 안내 (데스크톱 전용) */
export default function WizardArt() {
  return (
    <aside className="hidden lg:block absolute right-0 top-0 w-[340px]">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-[#141414]">
        <Image src="/img/onboard.webp" alt="" fill sizes="340px" className="object-cover" />
      </div>
      <ol className="mt-5 space-y-3 text-sm text-text-dim">
        <li><span className="text-accent font-mono mr-2">01</span>이름과 종류를 고르고</li>
        <li><span className="text-accent font-mono mr-2">02</span>플랜을 정해 입금하면</li>
        <li><span className="text-accent font-mono mr-2">03</span>서버가 자동으로 만들어져요</li>
      </ol>
    </aside>
  );
}
