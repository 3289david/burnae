"use client";

import { useState } from "react";

export default function EmailRegisterForm({ referralCode }: { referralCode?: string }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/email/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password, referralCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "가입 중 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="card-glow p-4 text-sm animate-toast-in">
        <p><strong>{email}</strong>로 인증 메일을 보냈어요. 메일의 버튼을 누르면 바로 로그인돼요.</p>
        <p className="text-xs text-text-dim mt-1.5">메일이 안 보이면 스팸함(스팸 메일함)도 확인해주세요.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <input
        type="text"
        className="input w-full text-sm"
        placeholder="이름"
        maxLength={20}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
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
        placeholder="비밀번호 (8자 이상)"
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <button
        type="submit"
        disabled={busy || !email || !name || password.length < 8}
        className="btn-primary w-full py-2.5 text-sm active:scale-[0.98] transition-transform disabled:opacity-40"
      >
        {busy ? "처리 중..." : "이메일로 시작하기"}
      </button>
      {error && <p className="text-xs text-red">{error}</p>}
    </form>
  );
}
