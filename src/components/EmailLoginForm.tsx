"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

export default function EmailLoginForm() {
  const t = useTranslations("emailLoginForm");
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
        setError(data.error ?? t("loginFailed"));
        return;
      }
      if (data.requiresTwoFactor) {
        setNeedsTwoFactor(true);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError(t("loginError"));
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
      setError(err instanceof Error ? err.message : t("resendFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <input
        type="email"
        className="input w-full text-sm"
        placeholder={t("emailPlaceholder")}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="password"
        className="input w-full text-sm"
        placeholder={t("passwordPlaceholder")}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {needsTwoFactor && (
        <input
          type="text"
          inputMode="numeric"
          className="input w-full text-sm font-mono tracking-widest"
          placeholder={t("twoFactorPlaceholder")}
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
        {busy ? t("submitBusy") : t("submit")}
      </button>
      {needsVerification && (
        <button
          type="button"
          onClick={resendVerification}
          disabled={busy || resendDone}
          className="btn-secondary w-full py-2 text-xs active:scale-95 transition-transform disabled:opacity-40"
        >
          {resendDone ? t("resendDone") : t("resend")}
        </button>
      )}
      {needsVerification && (
        <p className="text-xs text-text-dim">{t("checkSpam")}</p>
      )}
      {error && <p className="text-xs text-red">{error}</p>}
    </form>
  );
}
