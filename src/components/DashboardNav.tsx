"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Menu, Search } from "lucide-react";
import LogoutButton from "@/components/LogoutButton";
import ThemeToggle from "@/components/ThemeToggle";
import { OPEN_COMMAND_PALETTE_EVENT } from "@/components/CommandPalette";

interface Props {
  userName: string;
  showAdminLink: boolean;
}

export default function DashboardNav({ userName, showAdminLink }: Props) {
  const t = useTranslations("dashboardNav");
  const [open, setOpen] = useState(false);

  const LINKS = [
    { href: "/dashboard/community-eggs", label: t("communityEggs") },
    { href: "/dashboard/promotions", label: t("promotions") },
    { href: "/dashboard/billing", label: t("billing") },
    { href: "/dashboard/support", label: t("support") },
    { href: "/dashboard/account", label: t("account") },
  ];

  return (
    <>
      {/* 데스크톱: 한 줄 */}
      <nav className="hidden sm:flex items-center gap-4">
        <span className="text-sm text-text-dim">{t("greeting", { name: userName })}</span>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT))}
          className="hidden md:inline-flex items-center gap-1.5 text-xs text-text-dim bg-surface-2 rounded-full px-2.5 py-1 hover:text-text active:scale-95 transition-transform"
        >
          <Search size={12} /> {t("search")}
          <kbd className="text-[10px] bg-surface rounded px-1 py-0.5 ml-1">⌘K</kbd>
        </button>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="text-sm text-text-dim hover:text-text transition-colors">
            {l.label}
          </Link>
        ))}
        {showAdminLink && (
          <Link href="/admin" className="text-sm text-accent hover:underline">{t("admin")}</Link>
        )}
        <ThemeToggle />
        <LogoutButton />
      </nav>

      {/* 모바일: 햄버거 메뉴 */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="sm:hidden flex items-center gap-1.5 text-sm text-text-dim px-2 py-1 active:scale-95 transition-transform"
        aria-label={t("menu")}
      >
        <Menu size={18} className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`} /> {t("menu")}
      </button>
      {open && (
        <div className="sm:hidden absolute top-full left-0 right-0 bg-surface border-b border-border px-6 py-3 space-y-3 z-10 animate-toast-in">
          <p className="text-sm text-text-dim">{t("greeting", { name: userName })}</p>
          {LINKS.map((l, i) => (
            <Link
              key={l.href}
              href={l.href}
              className="block text-sm text-text animate-fade-up"
              style={{ animationDelay: `${i * 0.03}s` }}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          ))}
          {showAdminLink && (
            <Link href="/admin" className="block text-sm text-accent" onClick={() => setOpen(false)}>
              {t("admin")}
            </Link>
          )}
          <div className="flex items-center justify-between">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      )}
    </>
  );
}
