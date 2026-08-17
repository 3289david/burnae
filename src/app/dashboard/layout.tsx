import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdminEmail } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-xl font-bold">🔥 Burnae</Link>
          <nav className="flex items-center gap-4">
            <span className="text-sm text-text-dim">{user.name}님</span>
            <Link href="/dashboard/billing" className="text-sm text-text-dim hover:text-text">결제 내역</Link>
            <Link href="/dashboard/account" className="text-sm text-text-dim hover:text-text">계정</Link>
            {user.role === "ADMIN" && isAdminEmail(user.email) && (
              <Link href="/admin" className="text-sm text-accent">
                관리자
              </Link>
            )}
            <LogoutButton />
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
