import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdminEmail } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

const NAV = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/servers", label: "서버" },
  { href: "/admin/products", label: "상품" },
  { href: "/admin/templates", label: "서버 종류" },
  { href: "/admin/nodes", label: "노드" },
  { href: "/admin/users", label: "유저" },
  { href: "/admin/events", label: "이벤트/쿠폰" },
  { href: "/admin/bank-account", label: "결제 계좌" },
  { href: "/admin/logs", label: "로그" },
  { href: "/admin/statistics", label: "통계" },
  { href: "/admin/settings", label: "호스팅 설정" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN" || !isAdminEmail(user.email)) redirect("/login");

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/admin" className="text-xl font-bold">🔥 Burnae Admin</Link>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm text-text-dim hover:text-text">고객 화면으로</Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="flex-1 max-w-6xl w-full mx-auto flex gap-8 px-6 py-8">
        <nav className="w-44 shrink-0 space-y-1">
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
