import { prisma } from "@/lib/prisma";

export default async function AdminDashboardPage() {
  const [userCount, serverCount, activeServers, nodes] = await Promise.all([
    prisma.user.count(),
    prisma.server.count({ where: { deletedAt: null } }),
    prisma.server.count({ where: { deletedAt: null, status: "RUNNING" } }),
    prisma.hostNode.findMany(),
  ]);

  const usage = await prisma.server.groupBy({
    by: ["nodeId"],
    where: { deletedAt: null },
    _sum: { ramMb: true },
  });
  const usageMap = new Map(usage.map((u) => [u.nodeId, u._sum.ramMb ?? 0]));

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const revenue = await prisma.order.aggregate({
    where: { status: "PAID", paidAt: { gte: monthStart } },
    _sum: { amountKrw: true },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">대시보드</h1>

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="전체 유저" value={userCount.toLocaleString()} />
        <Stat label="전체 서버" value={serverCount.toLocaleString()} />
        <Stat label="온라인 서버" value={activeServers.toLocaleString()} />
        <Stat label="이번 달 매출" value={`${(revenue._sum.amountKrw ?? 0).toLocaleString()}원`} />
      </div>

      <h2 className="mt-8 font-semibold">노드 현황</h2>
      <div className="mt-3 space-y-2">
        {nodes.map((n) => {
          const used = usageMap.get(n.id) ?? 0;
          const pct = Math.min(100, Math.round((used / Math.max(1, n.totalRamMb - n.reservedRamMb)) * 100));
          return (
            <div key={n.id} className="card-glow p-4">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{n.name} · {n.location}</span>
                <span className="text-text-dim">{(used / 1024).toFixed(0)}GB / {((n.totalRamMb - n.reservedRamMb) / 1024).toFixed(0)}GB</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
        {nodes.length === 0 && <p className="text-sm text-text-dim">등록된 노드가 없어요. &apos;노드&apos; 메뉴에서 추가하세요.</p>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-glow p-4">
      <div className="text-xs text-text-dim">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}
