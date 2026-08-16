import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import EventsBanner from "@/components/EventsBanner";

const statusLabel: Record<string, { text: string; dot: string }> = {
  RUNNING: { text: "온라인", dot: "🟢" },
  PROVISIONING: { text: "생성 중", dot: "🟡" },
  STARTING: { text: "시작 중", dot: "🟡" },
  STOPPING: { text: "정지 중", dot: "🟡" },
  STOPPED: { text: "오프라인", dot: "🔴" },
  SUSPENDED: { text: "정지됨(결제 필요)", dot: "⛔" },
  ERROR: { text: "오류", dot: "🔴" },
  DELETING: { text: "삭제 중", dot: "🔴" },
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
  const usedMb = servers.reduce((sum, s) => sum + s.diskMb, 0);
  const quotaGb = user!.storageQuotaGbOverride ?? settings.defaultUserStorageGb;

  return (
    <div>
      <EventsBanner />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">내 서버</h1>
        <Link href="/dashboard/servers/new" className="btn-primary px-4 py-2">
          + 서버 만들기
        </Link>
      </div>

      <p className="mt-2 text-sm text-text-dim">
        저장공간 {(usedMb / 1024).toFixed(1)}GB / {quotaGb}GB 사용 중
      </p>

      {servers.length === 0 ? (
        <div className="card mt-8 p-10 text-center">
          <p className="text-text-dim">아직 만든 서버가 없어요.</p>
          <Link href="/dashboard/servers/new" className="btn-primary inline-block mt-4 px-5 py-2.5">
            첫 서버 만들기
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid sm:grid-cols-2 gap-4">
          {servers.map((s) => {
            const label = statusLabel[s.status] ?? { text: s.status, dot: "⚪" };
            return (
              <Link
                key={s.id}
                href={`/dashboard/servers/${s.id}`}
                className="card p-5 block hover:border-accent transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-sm">{label.dot} {label.text}</span>
                </div>
                <p className="mt-1 text-sm text-text-dim">
                  {s.subdomains[0] ? `${s.subdomains[0].subdomain}.${settings.subdomainZone}` : "주소 준비 중"}
                </p>
                <div className="mt-3 flex gap-4 text-xs text-text-dim">
                  <span>RAM {(s.ramMb / 1024).toFixed(0)}GB</span>
                  <span>디스크 {(s.diskMb / 1024).toFixed(0)}GB</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
