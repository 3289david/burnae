import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import OAuthButtons from "@/components/OAuthButtons";
import EmailRegisterForm from "@/components/EmailRegisterForm";
import BrandMark from "@/components/BrandMark";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const t = await getTranslations("register");

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-2 text-xl font-bold font-display">
            <BrandMark /> Burnae
          </Link>
          <Link href="/login" className="text-xs text-text-dim hover:text-text border border-border rounded-full px-3 py-1.5">
            {t("loginLink")}
          </Link>
        </div>
        <h1 className="mt-6 text-2xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-sm text-text-dim">{t("subtitle")}</p>
        {ref && (
          <p className="animate-toast-in mt-2 text-xs text-accent">{t("referralNote")}</p>
        )}

        <div className="mt-6">
          <OAuthButtons referralCode={ref} />
        </div>

        <div className="my-5 flex items-center gap-3 text-xs text-text-dim">
          <span className="flex-1 h-px bg-border" /> {t("or")} <span className="flex-1 h-px bg-border" />
        </div>

        <EmailRegisterForm referralCode={ref} />

        <p className="mt-6 text-xs text-text-dim">
          {t("agreementPrefix")} <Link href="/legal/terms" className="text-accent">{t("termsLink")}</Link> {t("and")}{" "}
          <Link href="/legal/privacy" className="text-accent">{t("privacyLink")}</Link>{t("agreementSuffix")}
        </p>
      </div>
    </div>
  );
}
