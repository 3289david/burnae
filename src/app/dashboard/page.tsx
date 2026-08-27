import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import EventsBanner from "@/components/EventsBanner";
import StatusDot from "@/components/StatusDot";
import EmptyServerIllustration from "@/components/EmptyServerIllustration";
import { Plus, HardDrive, ArrowRight } from "lucide-react";

const statusLabel: Record<string, { text: string; dot: "green" | "yellow" | "red" | "gray" }> = {
  RUNNING: { text: "온라인", dot: "green" },
  PROVISIONING: { text: "생성 중", dot: "yellow" },
  STARTING: { text: "시작 중", dot: "yellow" },
  STOPPING: { text: "정지 중", dot: "yellow" },
  STOPPED: { text: "오프라인", dot: "red" },
  SUSPENDED: { text: "정지됨(결제 필요)", dot: "red" },
  ERROR: { text: "오류", dot: "red" },
  DELETING: { text: "삭제 중", dot: "red" },
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const servers = await prisma.server.findMany({
    where: {
      deletedAt: null,
      OR: [{ ownerId: user!.id }, { members: { some: { userId: user!.id } } }],
    },
    orderBy: { createdAt: "desc" },
    include: { subdomains: { orderBy: { isPrimary: "desc" } } },
  });

  const settings = await prisma.hostingSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  const usedGb = servers.reduce((sum, s) => sum + s.diskMb, 0) / 1024;
  const quotaGb = user!.storageQuotaGbOverride ?? settings.defaultUserStorageGb;
  const usedPct = Math.min(100, Math.round((usedGb / quotaGb) * 100));
  const runningCount = servers.filter((s) => s.status === "RUNNING").length;

  return (
    <div className="relative">
      <div className="blob w-72 h-72 bg-flame-2 -top-32 -right-20 animate-float pointer-events-none" />

      <EventsBanner />

      <div className="relative flex flex-wrap items-center justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-display">
            안녕하세요, <span className="text-gradient">{user!.name}</span>님
          </h1>
          <p className="text-sm text-text-dim mt-1">
            서버 {servers.length}개 · 그중 {runningCount}개 가동 중
          </p>
        </div>
        <Link href="/dashboard/servers/new" className="btn-primary px-5 py-2.5 inline-flex items-center gap-1.5">
          <Plus size={17} /> 서버 만들기
        </Link>
      </div>

      {/* 저장공간 카드 */}
      <div
        className="relative card-glow mt-6 p-5 flex items-center gap-4 animate-fade-up"
        style={{ animationDelay: "0.05s" }}
      >
        <span className="w-11 h-11 rounded-2xl bg-accent/15 flex items-center justify-center shrink-0">
          <HardDrive size={20} className="text-accent" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium">저장공간</span>
            <span className="text-sm text-text-dim shrink-0">
              {usedGb.toFixed(1)}GB / {quotaGb}GB
            </span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-surface-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${usedPct}%`,
                background:
                  usedPct >= 90
                    ? "var(--red)"
                    : usedPct >= 70
                      ? "var(--yellow)"
                      : "linear-gradient(90deg, var(--flame-1), var(--flame-3))",
              }}
            />
          </div>
        </div>
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
        <div className="mt-6 grid sm:grid-cols-2 gap-4">
          {servers.map((s, i) => {
            const label = statusLabel[s.status] ?? { text: s.status, dot: "gray" as const };
            return (
              <Link
                key={s.id}
                href={`/dashboard/servers/${s.id}`}
                className="card-glow p-5 block animate-fade-up"
                style={{ animationDelay: `${0.1 + i * 0.05}s` }}
              >
                <div className="flex flex-wrap items-center justify-between gap-x-2">
                  <span className="font-semibold truncate min-w-0">{s.name}</span>
                  <span className="text-sm shrink-0 inline-flex items-center gap-1.5">
                    <StatusDot color={label.dot} /> {label.text}
                  </span>
                </div>
                <p className="mt-1 text-sm text-text-dim font-mono truncate">
                  {s.subdomains[0] ? `${s.subdomains[0].subdomain}.${settings.subdomainZone}` : "주소 준비 중"}
                </p>
                <div className="mt-4 flex gap-2 text-xs">
                  <span className="rounded-full bg-surface-2 px-2.5 py-1 text-text-dim">
                    RAM {(s.ramMb / 1024).toFixed(0)}GB
                  </span>
                  <span className="rounded-full bg-surface-2 px-2.5 py-1 text-text-dim">
                    디스크 {(s.diskMb / 1024).toFixed(0)}GB
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
