import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import EventsBanner from "@/components/EventsBanner";
import EmptyServerIllustration from "@/components/EmptyServerIllustration";
import CountUp from "@/components/CountUp";
import ServerListClient, { type DashboardServerItem } from "@/components/ServerListClient";
import { Plus, ArrowRight, Gift } from "lucide-react";

export default async function DashboardPage() {
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
  });

  return (
    <div className="relative">
      <div className="blob w-72 h-72 bg-flame-2 -top-32 -right-20 animate-float pointer-events-none" />

      {pendingGrants.map((o) => (
        <Link
          key={o.id}
          href={`/dashboard/servers/new?orderId=${o.id}`}
          className="relative card-glow mb-4 p-4 flex items-center gap-3 border-accent/40 bg-accent/[0.06] animate-fade-up"
        >
          <span className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
            <Gift size={17} className="text-accent" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">지급된 서버가 있어요!</p>
            <p className="text-xs text-text-dim mt-0.5">서버 종류와 버전을 고르면 바로 만들어져요 — {o.serverNameRequested}</p>
          </div>
          <ArrowRight size={16} className="text-accent shrink-0" />
        </Link>
      ))}

      <EventsBanner />

      <div className="relative flex flex-wrap items-center justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-display">
            안녕하세요, <span className="text-gradient">{user!.name}</span>님
          </h1>
          <p className="text-sm text-text-dim mt-1">
            서버 <CountUp value={servers.length} className="font-medium text-text" />개 · 그중{" "}
            <CountUp value={runningCount} className="font-medium text-green" />개 가동 중
          </p>
        </div>
        <Link href="/dashboard/servers/new" className="btn-primary px-5 py-2.5 inline-flex items-center gap-1.5">
          <Plus size={17} /> 서버 만들기
        </Link>
      </div>

      {servers.length === 0 ? (
        <div
          className="card-glow mt-6 p-12 text-center animate-fade-up"
          style={{ animationDelay: "0.1s" }}
        >
          <EmptyServerIllustration size={110} />
          <p className="text-text-dim mt-2">아직 만든 서버가 없어요.</p>
          <Link
            href="/dashboard/servers/new"
            className="btn-primary inline-flex items-center gap-1.5 mt-5 px-5 py-2.5"
          >
            첫 서버 만들기 <ArrowRight size={16} />
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
