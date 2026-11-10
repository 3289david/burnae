import { redirect } from "@/i18n/navigation";
import { getCurrentUser, isAdminEmail } from "@/lib/auth";
import { DashboardSidebar, DashboardTopBar, DashboardTabBar } from "@/components/DashboardNav";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import DiscordPromoBanner from "@/components/DiscordPromoBanner";
import CommandPalette from "@/components/CommandPalette";

export default async function DashboardLayout({ children }: LayoutProps<"/[locale]/dashboard">) {
  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: "/login", locale: "kr" });
    return null;
  }

  const showAdminLink = user.role === "ADMIN" && isAdminEmail(user.email);

  return (
    <div className="min-h-screen flex">
      <CommandPalette showAdminLink={showAdminLink} />
      <DashboardSidebar userName={user.name} userAvatarUrl={user.avatarUrl} showAdminLink={showAdminLink} />
      <div className="flex-1 min-w-0 flex flex-col">
        <DashboardTopBar userName={user.name} userAvatarUrl={user.avatarUrl} />
        <DiscordPromoBanner />
        <AnnouncementBanner maxWidthClass="max-w-[1600px]" />
        <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8 pb-28 lg:pb-12">{children}</main>
      </div>
      <DashboardTabBar showAdminLink={showAdminLink} />
    </div>
  );
}
