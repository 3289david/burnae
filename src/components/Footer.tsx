import Link from "next/link";
import BrandMark from "@/components/BrandMark";

export default function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-2 font-display font-bold">
          <BrandMark size={20} />
          Burnae
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-dim">
          <Link href="/legal/terms" className="hover:text-text">이용약관</Link>
          <Link href="/legal/privacy" className="hover:text-text">개인정보처리방침</Link>
          <Link href="/register" className="hover:text-text">시작하기</Link>
        </nav>
      </div>
      <div className="max-w-6xl mx-auto px-6 pb-8 text-xs text-text-dim">
        © {new Date().getFullYear()} Burnae · burnae.kr · 이 서비스는 특정 은행/결제사와 제휴 관계가 없는 독립 서비스입니다.
      </div>
    </footer>
  );
}
