import Link from "next/link";
import OAuthButtons from "@/components/OAuthButtons";
import BrandMark from "@/components/BrandMark";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="inline-flex items-center gap-2 text-xl font-bold font-display">
          <BrandMark /> Burnae
        </Link>
        <h1 className="mt-6 text-2xl font-bold">시작하기</h1>
        <p className="mt-2 text-sm text-text-dim">
          아래 계정 중 하나로 바로 시작할 수 있어요. 처음이면 자동으로 가입돼요.
        </p>
        {ref && (
          <p className="mt-2 text-xs text-accent">추천 링크로 들어오셨네요 — 가입하면 추천인에게 포인트가 적립돼요.</p>
        )}

        <div className="mt-6">
          <OAuthButtons referralCode={ref} />
        </div>

        <p className="mt-6 text-xs text-text-dim">
          계속 진행하면 <Link href="/legal/terms" className="text-accent">이용약관</Link> 및{" "}
          <Link href="/legal/privacy" className="text-accent">개인정보처리방침</Link>에 동의하는 것으로 간주돼요.
        </p>
      </div>
    </div>
  );
}
