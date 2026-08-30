"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import OAuthButtons from "@/components/OAuthButtons";
import BrandMark from "@/components/BrandMark";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    if (oauthError) setError(oauthError);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm animate-fade-up">
        <Link href="/" className="inline-flex items-center gap-2 text-xl font-bold font-display">
          <BrandMark /> Burnae
        </Link>
        <h1 className="mt-6 text-2xl font-bold">로그인</h1>
        <p className="mt-2 text-sm text-text-dim">가입할 때 사용한 계정으로 로그인하세요.</p>

        <div className="mt-6 animate-fade-up" style={{ animationDelay: "0.1s" }}>
          <OAuthButtons />
        </div>

        {error && <p className="animate-toast-in mt-4 text-sm text-red">{error}</p>}

        <p className="mt-6 text-sm text-text-dim animate-fade-up" style={{ animationDelay: "0.15s" }}>
          계정이 없으신가요?{" "}
          <Link href="/register" className="text-accent">시작하기</Link>
        </p>
      </div>
    </div>
  );
}
