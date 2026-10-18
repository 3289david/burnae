"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import OAuthButtons from "@/components/OAuthButtons";
import EmailLoginForm from "@/components/EmailLoginForm";
import BrandMark from "@/components/BrandMark";

export default function LoginPage() {
  const t = useTranslations("login");
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
        <h1 className="mt-6 text-2xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-sm text-text-dim">{t("subtitle")}</p>

        <div className="mt-6 animate-fade-up" style={{ animationDelay: "0.1s" }}>
          <OAuthButtons />
        </div>

        <div className="my-5 flex items-center gap-3 text-xs text-text-dim animate-fade-up" style={{ animationDelay: "0.12s" }}>
          <span className="flex-1 h-px bg-border" /> {t("or")} <span className="flex-1 h-px bg-border" />
        </div>

        <div className="animate-fade-up" style={{ animationDelay: "0.14s" }}>
          <EmailLoginForm />
        </div>

        {error && <p className="animate-toast-in mt-4 text-sm text-red">{error}</p>}

        <p className="mt-6 text-sm text-text-dim animate-fade-up" style={{ animationDelay: "0.15s" }}>
          {t("noAccount")}{" "}
          <Link href="/register" className="text-accent">{t("startLink")}</Link>
        </p>
      </div>
    </div>
  );
}
