import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import EventsBanner from "@/components/EventsBanner";
import EmptyServerIllustration from "@/components/EmptyServerIllustration";
import CountUp from "@/components/CountUp";
import ServerListClient, { type DashboardServerItem } from "@/components/ServerListClient";
import PendingGrantBanner from "@/components/PendingGrantBanner";
import { Plus, ArrowRight } from "lucide-react";

export default async function DashboardPage() {
  const t = await getTranslations("dashboardHome");
  const user = await getCurrentUser();
  const servers = await prisma.server.findMany({
    where: {
      deletedAt: null,
      OR: [{ ownerId: user!.id }, { members: { some: { userId: user!.id } } }],
    },
    orderBy: [{ isFavorite: "desc" }, { createdAt: "desc" }],
    include: { subdomains: { orderBy: { isPrimary: "desc" } }, template: { select: { category: true } } },
  });

  const settings = await prisma.hostingSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  const runningCount = servers.filter((s) => s.status === "RUNNING").length;

  const pendingGrants = await prisma.order.findMany({
    where: {
      userId: user!.id,
      type: "NEW_SERVER",
      status: "PAID",
      serverId: null,
      templateIdRequested: null,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, serverNameRequested: true, isAdminGrant: true },
  });

  return (
    <div className="relative">
      <div className="blob w-72 h-72 bg-flame-2 -top-32 -right-20 animate-float pointer-events-none" />

      {pendingGrants.map((o) => (
        <PendingGrantBanner key={o.id} grant={o} />
      ))}

      <EventsBanner />

      <div className="relative flex flex-wrap items-center justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-display">
            {t("greeting")} <span className="text-gradient">{user!.name}</span>{t("greetingSuffix")}
          </h1>
          <p className="text-sm text-text-dim mt-1">
            {t("serverCountPrefix")}
            <CountUp value={servers.length} className="font-medium text-text" />
            {t("serverCountMiddle")}
            <CountUp value={runningCount} className="font-medium text-green" />
            {t("serverCountSuffix")}
          </p>
        </div>
        <Link href="/dashboard/servers/new" className="btn-primary px-5 py-2.5 inline-flex items-center gap-1.5">
          <Plus size={17} /> {t("createServer")}
        </Link>
      </div>

      {servers.length === 0 ? (
        <div
          className="card-glow mt-6 p-12 text-center animate-fade-up"
          style={{ animationDelay: "0.1s" }}
        >
          <EmptyServerIllustration size={110} />
          <p className="text-text-dim mt-2">{t("emptyText")}</p>
          <Link
            href="/dashboard/servers/new"
            className="btn-primary inline-flex items-center gap-1.5 mt-5 px-5 py-2.5"
          >
            {t("emptyCta")} <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <ServerListClient
          servers={servers.map(
            (s): DashboardServerItem => ({
              id: s.id,
              name: s.name,
              ownerId: s.ownerId,
              isOwner: s.ownerId === user!.id,
              isFavorite: s.isFavorite,
              status: s.status,
              hasIdentifier: !!s.pterodactylIdentifier,
              ramMb: s.ramMb,
              diskMb: s.diskMb,
              category: s.template.category,
              address: s.subdomains[0] ? `${s.subdomains[0].subdomain}.${settings.subdomainZone}` : "주소 준비 중",
            })
          )}
        />
      )}
    </div>
  );
}
