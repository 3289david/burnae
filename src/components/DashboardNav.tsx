"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import LogoutButton from "@/components/LogoutButton";
import ThemeToggle from "@/components/ThemeToggle";

interface Props {
  userName: string;
  showAdminLink: boolean;
}

const LINKS = [
  { href: "/dashboard/promotions", label: "홍보 포인트" },
  { href: "/dashboard/billing", label: "결제 내역" },
  { href: "/dashboard/account", label: "계정" },
];

export default function DashboardNav({ userName, showAdminLink }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* 데스크톱: 한 줄 */}
      <nav className="hidden sm:flex items-center gap-4">
        <span className="text-sm text-text-dim">{userName}님</span>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="text-sm text-text-dim hover:text-text">
            {l.label}
          </Link>
        ))}
        {showAdminLink && (
          <Link href="/admin" className="text-sm text-accent">관리자</Link>
        )}
        <ThemeToggle />
        <LogoutButton />
      </nav>

      {/* 모바일: 햄버거 메뉴 */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="sm:hidden flex items-center gap-1.5 text-sm text-text-dim px-2 py-1"
        aria-label="메뉴"
      >
        <Menu size={18} /> 메뉴
      </button>
      {open && (
        <div className="sm:hidden absolute top-full left-0 right-0 bg-surface border-b border-border px-6 py-3 space-y-3 z-10">
          <p className="text-sm text-text-dim">{userName}님</p>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="block text-sm text-text" onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
          {showAdminLink && (
            <Link href="/admin" className="block text-sm text-accent" onClick={() => setOpen(false)}>
              관리자
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
