"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import OAuthButtons from "@/components/OAuthButtons";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "가입에 실패했습니다.");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="text-xl font-bold">🔥 Burnae</Link>
        <h1 className="mt-6 text-2xl font-bold">회원가입</h1>

        <div className="mt-6">
          <OAuthButtons />
        </div>

        <div className="flex items-center gap-3 my-5 text-xs text-text-dim">
          <div className="flex-1 h-px bg-border" />
          또는
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            required
            maxLength={20}
            placeholder="이름 (입금자명으로도 쓰여요)"
            className="input w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="email"
            required
            placeholder="이메일"
            className="input w-full"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            required
            minLength={8}
            placeholder="비밀번호 (8자 이상)"
            className="input w-full"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-red">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full py-3">
            {loading ? "가입 중..." : "회원가입"}
          </button>
        </form>

        <p className="mt-4 text-sm text-text-dim">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="text-accent">
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
