import ArtCallout from "@/components/ArtCallout";
import PageHeader from "@/components/PageHeader";
import Image from "next/image";
import EmptyState from "@/components/EmptyState";
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

      {pendingGrants.map((o) => (
        <PendingGrantBanner key={o.id} grant={o} />
      ))}

      <EventsBanner />

      <PageHeader
        art="servers"
        title={<>{t("greeting")} {user!.name}{t("greetingSuffix")}</>}
        desc={<>{t("serverCountPrefix")}<CountUp value={servers.length} />{t("serverCountMiddle")}<CountUp value={runningCount} />{t("serverCountSuffix")}</>}
      >
        <Link href="/dashboard/servers/new" className="btn-primary px-6 py-3 text-sm inline-flex items-center gap-1.5 active:scale-[0.97] transition-transform">
          <Plus size={16} /> {t("createServer")}
        </Link>
      </PageHeader>

      {servers.length === 0 ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr] items-stretch animate-fade-up">
          <div className="card p-6 sm:p-9 flex flex-col justify-center">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">처음이세요?</p>
            <h2 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight">3단계면 첫 서버가 생겨요</h2>
            <ol className="mt-6 space-y-4">
              {[["서버 종류 고르기", "디스코드 봇이나 VPS 중 하나를 골라요."], ["플랜 고르고 입금하기", "입금자명과 금액만 맞으면 자동으로 확인돼요."], ["주소로 바로 접속", "서버 설치와 주소 연결은 자동이에요."]].map(([h, d], i) => (
                <li key={h} className="flex gap-4">
                  <span className="shrink-0 w-8 h-8 rounded-full bg-accent/15 text-accent text-sm font-semibold flex items-center justify-center">{i + 1}</span>
                  <div><p className="font-medium">{h}</p><p className="text-sm text-text-dim mt-0.5">{d}</p></div>
                </li>
              ))}
            </ol>
            <Link href="/dashboard/servers/new" className="btn-primary mt-8 self-start px-7 py-3.5 text-sm inline-flex items-center gap-1.5">
              {t("emptyCta")} <ArrowRight size={16} />
            </Link>
          </div>
          <div className="relative min-h-64 overflow-hidden rounded-xl border border-border bg-[#141414]">
            <Image src="/img/onboard.webp" alt="" fill sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover" />
          </div>
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

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <ArtCallout src="illus-free" title="무료로 서버가 더 필요하세요?" desc="포인트를 모으면 무료 체험 서버를 받을 수 있어요." href="/dashboard/promotions" cta="포인트 받으러 가기" />
        <ArtCallout src="illus-deploy" title="GitHub 저장소로 바로 배포" desc="Node.js·Python 코드를 올리면 서버가 자동으로 설치돼요." href="/dashboard/servers/new" cta="서버 만들기" />
      </div>
    </div>
  );
}
