import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import BrandMark from "@/components/BrandMark";

export default async function Footer() {
  const t = await getTranslations("footer");
  return (
    <footer className="border-t border-border">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-2 font-display font-bold">
          <BrandMark size={20} />
          Burnae
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-dim">
          <Link href="/legal/terms" className="hover:text-text">{t("terms")}</Link>
          <Link href="/legal/privacy" className="hover:text-text">{t("privacy")}</Link>
          <Link href="/legal/refund" className="hover:text-text">{t("refund")}</Link>
          <Link href="/legal/fair-use" className="hover:text-text">{t("fairUse")}</Link>
          <Link href="/register" className="hover:text-text">{t("start")}</Link>
        </nav>
      </div>
      <div className="max-w-6xl mx-auto px-6 pb-8 text-xs text-text-dim space-y-1">
        <p>{t("copyright", { year: new Date().getFullYear() })}</p>
        <p>{t("contact")}</p>
      </div>
    </footer>
  );
}
