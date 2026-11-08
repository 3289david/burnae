import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import OAuthButtons from "@/components/OAuthButtons";
import EmailRegisterForm from "@/components/EmailRegisterForm";
import AuthShell from "@/components/AuthShell";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const t = await getTranslations("register");

  return (
    <AuthShell
      action={
        <Link href="/login" className="text-sm text-text-dim hover:text-text border border-border rounded-full px-4 py-2">
          {t("loginLink")}
        </Link>
      }
    >
      <div>
        <h1 className="text-3xl font-bold font-display">{t("title")}</h1>
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
    </AuthShell>
  );
}
