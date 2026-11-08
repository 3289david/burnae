import { Link, redirect } from "@/i18n/navigation";
import { requireAdmin, hasAdminRole } from "@/lib/auth";
import { ADMIN_NAV_AREAS } from "@/lib/adminAreas";
import LogoutButton from "@/components/LogoutButton";
import BrandMark from "@/components/BrandMark";
import ThemeToggle from "@/components/ThemeToggle";

const NAV = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/servers", label: "서버" },
  { href: "/admin/products", label: "상품" },
  { href: "/admin/templates", label: "서버 종류" },
  { href: "/admin/presets", label: "커뮤니티 프리셋" },
  { href: "/admin/nodes", label: "노드" },
  { href: "/admin/users", label: "유저" },
  { href: "/admin/events", label: "이벤트/쿠폰" },
  { href: "/admin/orders", label: "주문" },
  { href: "/admin/preorders", label: "선주문" },
  { href: "/admin/announcements", label: "공지사항" },
  { href: "/admin/blog", label: "블로그" },
  { href: "/admin/promotions", label: "포인트 받기" },
  { href: "/admin/shop", label: "포인트 상점" },
  { href: "/admin/role-shop", label: "칭호/역할 상점" },
  { href: "/admin/bank-account", label: "결제 계좌" },
  { href: "/admin/crypto", label: "코인 결제" },
  { href: "/admin/logs", label: "로그" },
  { href: "/admin/statistics", label: "통계" },
  { href: "/admin/discord", label: "디스코드 봇" },
  { href: "/admin/activity", label: "유저 활동 분석" },
  { href: "/admin/surveys", label: "설문/피드백" },
  { href: "/admin/support", label: "고객지원" },
  { href: "/admin/settings", label: "호스팅 설정" },
  { href: "/admin/ai", label: "AI 설정" },
];

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children, params }: LayoutProps<"/[locale]/admin">) {
  const { locale } = await params;
  const user = await requireAdmin();
  if (!user) {
    redirect({ href: "/login", locale: "kr" });
    return null;
  }

  const visibleNav = NAV.filter((item) => hasAdminRole(user, ADMIN_NAV_AREAS[item.href] ?? []));

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border sticky top-0 z-30 glass">
        <div className="wrap-wide py-3 flex items-center justify-between gap-2 flex-wrap">
          <Link href="/admin" className="inline-flex items-center gap-2 text-lg sm:text-xl font-bold font-display shrink-0">
            <BrandMark size={22} /> Burnae Admin
          </Link>
          <div className="flex items-center gap-3 sm:gap-4 text-sm">
            <Link href="/dashboard" className="text-text-dim hover:text-text whitespace-nowrap">고객 화면으로</Link>
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* 모바일: 가로 스크롤 탭 메뉴 */}
      <nav className="md:hidden sticky top-[57px] z-20 bg-bg border-b border-border overflow-x-auto whitespace-nowrap px-4 py-2 flex gap-1">
        {visibleNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs text-text-dim bg-surface-2 hover:text-text"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex-1 wrap-wide flex gap-8 py-6 sm:py-8">
        {/* 데스크톱: 세로 사이드바 */}
        <nav className="hidden md:block w-52 shrink-0 space-y-1 sticky top-20 self-start max-h-[calc(100vh-6rem)] overflow-y-auto">
          {visibleNav.map((item) => (
            <Link key={item.href} href={item.href} className="nav-link">
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
