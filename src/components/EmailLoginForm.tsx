"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EmailLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendDone, setResendDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNeedsVerification(false);
    try {
      const res = await fetch("/api/auth/email/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, code: code || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "EMAIL_NOT_VERIFIED") setNeedsVerification(true);
        if (data.requiresTwoFactor) setNeedsTwoFactor(true);
        setError(data.error ?? "로그인에 실패했어요.");
        return;
      }
      if (data.requiresTwoFactor) {
        setNeedsTwoFactor(true);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("로그인 중 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/email/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResendDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "재전송 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <input
        type="email"
        className="input w-full text-sm"
        placeholder="이메일"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="password"
        className="input w-full text-sm"
        placeholder="비밀번호"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {needsTwoFactor && (
        <input
          type="text"
          inputMode="numeric"
          className="input w-full text-sm font-mono tracking-widest"
          placeholder="2단계 인증 코드 (6자리 또는 복구 코드)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
        />
      )}
      <button
        type="submit"
        disabled={busy || !email || !password}
        className="btn-primary w-full py-2.5 text-sm active:scale-[0.98] transition-transform disabled:opacity-40"
      >
        {busy ? "확인 중..." : "이메일로 로그인"}
      </button>
      {needsVerification && (
        <button
          type="button"
          onClick={resendVerification}
          disabled={busy || resendDone}
          className="btn-secondary w-full py-2 text-xs active:scale-95 transition-transform disabled:opacity-40"
        >
          {resendDone ? "인증 메일을 다시 보냈어요" : "인증 메일 다시 받기"}
        </button>
      )}
      {error && <p className="text-xs text-red">{error}</p>}
    </form>
  );
}
