import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdminEmail } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import BrandMark from "@/components/BrandMark";

const NAV = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/servers", label: "서버" },
  { href: "/admin/products", label: "상품" },
  { href: "/admin/templates", label: "서버 종류" },
  { href: "/admin/nodes", label: "노드" },
  { href: "/admin/users", label: "유저" },
  { href: "/admin/events", label: "이벤트/쿠폰" },
  { href: "/admin/orders", label: "주문" },
  { href: "/admin/preorders", label: "선주문" },
  { href: "/admin/announcements", label: "공지사항" },
  { href: "/admin/promotions", label: "홍보 포인트" },
  { href: "/admin/bank-account", label: "결제 계좌" },
  { href: "/admin/logs", label: "로그" },
  { href: "/admin/statistics", label: "통계" },
  { href: "/admin/discord", label: "디스코드 봇" },
  { href: "/admin/surveys", label: "설문/피드백" },
  { href: "/admin/settings", label: "호스팅 설정" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN" || !isAdminEmail(user.email)) redirect("/login");

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-2 flex-wrap">
          <Link href="/admin" className="inline-flex items-center gap-2 text-lg sm:text-xl font-bold font-display shrink-0">
            <BrandMark size={22} /> Burnae Admin
          </Link>
          <div className="flex items-center gap-3 sm:gap-4 text-sm">
            <Link href="/dashboard" className="text-text-dim hover:text-text whitespace-nowrap">고객 화면으로</Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* 모바일: 가로 스크롤 탭 메뉴 */}
      <nav className="md:hidden border-b border-border overflow-x-auto whitespace-nowrap px-4 py-2 flex gap-1">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs text-text-dim bg-surface-2 hover:text-text"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex-1 max-w-6xl w-full mx-auto flex gap-8 px-4 sm:px-6 py-6 sm:py-8">
        {/* 데스크톱: 세로 사이드바 */}
        <nav className="hidden md:block w-44 shrink-0 space-y-1">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="block px-3 py-2 rounded-lg text-sm text-text-dim hover:text-text hover:bg-surface-2">
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
