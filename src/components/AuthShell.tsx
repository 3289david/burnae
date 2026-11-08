import { Link } from "@/i18n/navigation";
import BrandMark from "@/components/BrandMark";
import Image from "next/image";

/** 로그인/가입 공통 틀: 데스크톱은 왼쪽 이미지 + 오른쪽 폼, 모바일은 폼만 */
export default function AuthShell({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden lg:flex flex-col justify-center gap-6 p-12 xl:p-16 bg-surface border-r border-border">
                <div className="relative mx-auto w-full max-w-sm aspect-[3/4] overflow-hidden rounded-xl border border-border bg-[#141414]"><Image src="/img/illus-auth.webp" alt="" fill priority sizes="30vw" className="object-cover" /></div>
        <Link href="/" className="absolute top-8 left-10 flex items-center gap-2 text-xl font-bold font-display">
          <BrandMark size={28} /> Burnae
        </Link>
      </div>
      <div className="flex flex-col px-5 sm:px-10 py-6">
        <div className="flex items-center justify-between lg:justify-end">
          <Link href="/" className="lg:hidden inline-flex items-center gap-2 text-xl font-bold font-display">
            <BrandMark size={26} /> Burnae
          </Link>
          {action}
        </div>
        <div className="flex-1 flex items-center justify-center py-8">
          <div className="w-full max-w-sm animate-fade-up">{children}</div>
        </div>
      </div>
    </div>
  );
}
