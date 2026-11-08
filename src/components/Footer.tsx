import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import BrandMark from "@/components/BrandMark";

export default async function Footer() {
  const t = await getTranslations("footer");
  const cols = [
    {
      title: "Burnae",
      links: [
        { href: "/register", label: t("start") },
        { href: "/blog", label: t("blog") },
        { href: "/docs/api", label: t("apiDocs") },
      ],
    },
    {
      title: "Legal",
      links: [
        { href: "/legal/terms", label: t("terms") },
        { href: "/legal/privacy", label: t("privacy") },
        { href: "/legal/refund", label: t("refund") },
        { href: "/legal/fair-use", label: t("fairUse") },
      ],
    },
  ];
  return (
    <footer className="border-t border-border bg-surface/40">
      <div className="wrap-wide py-12 grid gap-10 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2 font-display font-bold text-lg">
            <BrandMark size={24} />
            Burnae
          </div>
          <p className="mt-4 text-xs text-text-dim leading-relaxed max-w-md">{t("contact")}</p>
        </div>
        {cols.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <p className="text-xs font-semibold uppercase tracking-wider text-text-dim">{c.title}</p>
            <ul className="mt-4 space-y-3 text-sm">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-text hover:text-accent transition-colors">{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <p className="wrap-wide py-5 text-xs text-text-dim">{t("copyright", { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  );
}
