"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Server, Gift, ShoppingBag, CreditCard, LifeBuoy, User, Users, Search, Plus, ShieldCheck, MoreHorizontal, X } from "lucide-react";
import LogoutButton from "@/components/LogoutButton";
import ThemeToggle from "@/components/ThemeToggle";
import BrandMark from "@/components/BrandMark";
import Avatar from "@/components/Avatar";
import { OPEN_COMMAND_PALETTE_EVENT } from "@/components/CommandPalette";

interface Props {
  userName: string;
  userAvatarUrl: string | null;
  showAdminLink: boolean;
}

function useLinks() {
  const t = useTranslations("dashboardNav");
  return [
    { href: "/dashboard", label: t("servers"), icon: Server, exact: true },
    { href: "/dashboard/promotions", label: t("promotions"), icon: Gift },
    { href: "/dashboard/points-shop", label: t("pointsShop"), icon: ShoppingBag },
    { href: "/dashboard/community-eggs", label: t("communityEggs"), icon: Users },
    { href: "/dashboard/billing", label: t("billing"), icon: CreditCard },
    { href: "/dashboard/support", label: t("support"), icon: LifeBuoy },
    { href: "/dashboard/account", label: t("account"), icon: User },
  ];
}

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href || pathname.startsWith("/dashboard/servers") : pathname === href || pathname.startsWith(href + "/");
}

function openSearch() {
  window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT));
}

/** 데스크톱(lg+): 왼쪽 고정 사이드바 */
export function DashboardSidebar({ userName, userAvatarUrl, showAdminLink }: Props) {
  const t = useTranslations("dashboardNav");
  const tHome = useTranslations("dashboardHome");
  const pathname = usePathname();
  const links = useLinks();

  return (
    <aside className="hidden lg:flex sticky top-0 h-screen w-64 xl:w-72 shrink-0 flex-col border-r border-border bg-surface/50 p-4">
      <Link href="/dashboard" className="flex items-center gap-2 px-2 py-2 text-xl font-bold font-display">
        <BrandMark size={26} /> Burnae
      </Link>

      <Link href="/dashboard/servers/new" className="btn-primary mt-5 px-4 py-3 text-sm inline-flex items-center justify-center gap-1.5">
        <Plus size={16} /> {tHome("createServer")}
      </Link>

      <button
        onClick={openSearch}
        className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-text-dim hover:text-text transition-colors"
      >
        <Search size={15} /> {t("search")}
        <kbd className="ml-auto text-[10px] bg-surface rounded px-1.5 py-0.5">⌘K</kbd>
      </button>

      <nav className="mt-5 flex-1 space-y-1 overflow-y-auto">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="nav-link" aria-current={isActive(pathname, l.href, l.exact) ? "page" : undefined}>
            <l.icon size={18} /> {l.label}
          </Link>
        ))}
        {showAdminLink && (
          <Link href="/admin" className="nav-link !text-accent">
            <ShieldCheck size={18} /> {t("admin")}
          </Link>
        )}
      </nav>

      <div className="border-t border-border pt-4 flex items-center justify-between gap-2">
        <Link href="/dashboard/account" className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity">
          <Avatar src={userAvatarUrl} name={userName} size={28} />
          <span className="text-sm font-medium truncate">{t("greeting", { name: userName })}</span>
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
}

/** 모바일/태블릿(<lg): 상단 바 */
export function DashboardTopBar({ userName, userAvatarUrl }: Pick<Props, "userName" | "userAvatarUrl">) {
  const t = useTranslations("dashboardNav");
  return (
    <header className="lg:hidden sticky top-0 z-30 glass border-b border-border/70">
      <div className="h-14 px-4 flex items-center justify-between gap-3">
        <Link href="/dashboard" className="flex items-center gap-2 text-lg font-bold font-display">
          <BrandMark size={24} /> Burnae
        </Link>
        <div className="flex items-center gap-1">
          <span className="hidden sm:block text-sm text-text-dim mr-2">{t("greeting", { name: userName })}</span>
          <button onClick={openSearch} aria-label={t("search")} className="w-10 h-10 rounded-full flex items-center justify-center text-text-dim hover:bg-surface-2">
            <Search size={18} />
          </button>
          <ThemeToggle />
          <Link href="/dashboard/account" className="ml-1">
            <Avatar src={userAvatarUrl} name={userName} size={30} />
          </Link>
        </div>
      </div>
    </header>
  );
}

/** 모바일/태블릿(<lg): 하단 탭바 — 엄지로 닿는 핵심 메뉴 4개 + 더보기 */
export function DashboardTabBar({ showAdminLink }: Pick<Props, "showAdminLink">) {
  const t = useTranslations("dashboardNav");
  const pathname = usePathname();
  const links = useLinks();
  const [open, setOpen] = useState(false);

  // 내 서버/포인트 받기/고객지원/커뮤니티 프리셋을 엄지로 바로 닿는 4개로 둔다
  const main = [links[0], links[1], links[5], links[3]];
  const more = [links[2], links[4], links[6]];
  const moreActive = more.some((l) => isActive(pathname, l.href));

  return (
    <>
      {open && (
        <div className="lg:hidden fixed inset-0 z-40" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="absolute inset-x-0 bottom-0 bg-surface border-t border-border rounded-t-3xl p-4 pb-24 animate-slide-in-bottom" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-2 pb-2">
              <p className="font-semibold">{t("menu")}</p>
              <button onClick={() => setOpen(false)} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-2" aria-label="close"><X size={18} /></button>
            </div>
            {more.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="nav-link !py-3.5 !text-base" aria-current={isActive(pathname, l.href) ? "page" : undefined}>
                <l.icon size={20} /> {l.label}
              </Link>
            ))}
            {showAdminLink && (
              <Link href="/admin" onClick={() => setOpen(false)} className="nav-link !py-3.5 !text-base !text-accent">
                <ShieldCheck size={20} /> {t("admin")}
              </Link>
            )}
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3 px-2">
              <LogoutButton />
            </div>
          </div>
        </div>
      )}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 glass border-t border-border safe-bottom">
        <div className="grid grid-cols-5 h-16">
          {main.map((l) => {
            const active = isActive(pathname, l.href, l.exact);
            return (
              <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined} className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${active ? "text-accent" : "text-text-dim"}`}>
                <l.icon size={21} />
                {l.label}
              </Link>
            );
          })}
          <button onClick={() => setOpen(true)} className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${moreActive || open ? "text-accent" : "text-text-dim"}`}>
            <MoreHorizontal size={21} />
            {t("more")}
          </button>
        </div>
      </nav>
    </>
  );
}
