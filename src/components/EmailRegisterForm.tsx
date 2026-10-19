"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export default function EmailRegisterForm({ referralCode }: { referralCode?: string }) {
  const t = useTranslations("emailRegisterForm");
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
      setError(err instanceof Error ? err.message : t("registerError"));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="card-glow p-4 text-sm animate-toast-in">
        <p>{t.rich("sentMessage", { email, b: (chunks) => <strong>{chunks}</strong> })}</p>
        <p className="text-xs text-text-dim mt-1.5">{t("checkSpam")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <input
        type="text"
        className="input w-full text-sm"
        placeholder={t("namePlaceholder")}
        maxLength={20}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
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
        {busy ? t("submitBusy") : t("submit")}
      </button>
      {error && <p className="text-xs text-red">{error}</p>}
    </form>
  );
}
