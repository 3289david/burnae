"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Menu, X } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import ThemeToggle from "@/components/ThemeToggle";

export default function SiteHeader({ loggedIn = false }: { loggedIn?: boolean }) {
  const t = useTranslations("home.nav");
  const [open, setOpen] = useState(false);

  const links = [
    { href: "/#features", label: t("features") },
    { href: "/#steps", label: t("steps") },
    { href: "/#pricing", label: t("pricing") },
    { href: "/#faq", label: t("faq") },
  ];

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 glass border-b border-border">
      <div className="wrap-wide h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold font-display shrink-0">
          <BrandMark size={26} /> Burnae
        </Link>

        <nav className="hidden md:flex items-center gap-1 ml-auto mr-4">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="px-3 py-2 text-sm text-text-dim hover:text-text transition-colors">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          {loggedIn ? (
            <Link href="/dashboard" className="btn-light px-5 py-2 text-sm inline-flex items-center">{t("dashboard")}</Link>
          ) : (
            <>
              <Link href="/login" className="hidden sm:inline-flex px-4 py-2 text-sm text-text-dim hover:text-text">{t("login")}</Link>
              <Link href="/register" className="btn-light px-5 py-2 text-sm inline-flex items-center">{t("start")}</Link>
            </>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            className="md:hidden w-10 h-10 rounded-full flex items-center justify-center text-text hover:bg-surface-2"
            aria-label={t("menu")}
            aria-expanded={open}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden fixed inset-x-0 top-16 bottom-0 z-30 bg-bg animate-fade-up overflow-y-auto">
          <nav className="wrap py-6 flex flex-col">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="py-4 text-2xl font-display font-semibold border-b border-border"
              >
                {l.label}
              </Link>
            ))}
            {!loggedIn && (
              <Link href="/login" onClick={() => setOpen(false)} className="py-4 text-2xl font-display font-semibold text-text-dim">
                {t("login")}
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
