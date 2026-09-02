import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdminEmail } from "@/lib/auth";
import DashboardNav from "@/components/DashboardNav";
import BrandMark from "@/components/BrandMark";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import CommandPalette from "@/components/CommandPalette";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const showAdminLink = user.role === "ADMIN" && isAdminEmail(user.email);

  return (
    <div className="min-h-screen flex flex-col">
      <CommandPalette showAdminLink={showAdminLink} />
      <header className="border-b border-border relative">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-xl font-bold font-display">
            <BrandMark size={24} /> Burnae
          </Link>
          <DashboardNav userName={user.name} showAdminLink={showAdminLink} />
        </div>
      </header>
      <AnnouncementBanner />
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}
