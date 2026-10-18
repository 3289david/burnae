import { prisma } from "@/lib/prisma";
import StatTile from "@/components/StatTile";

export default async function AdminStatisticsPage() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalServers,
    activeServers,
    totalUsers,
    nodes,
    activeServerList,
    newServersThisMonth,
    churnedServersLast30d,
    revenueThisMonth,
  ] = await Promise.all([
    prisma.server.count({ where: { deletedAt: null } }),
    prisma.server.count({ where: { deletedAt: null, status: "RUNNING" } }),
    prisma.user.count(),
    prisma.hostNode.findMany(),
    prisma.server.findMany({ where: { deletedAt: null }, include: { product: true } }),
    prisma.server.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.server.count({ where: { deletedAt: { gte: last30d } } }),
    prisma.order.aggregate({ where: { status: "PAID", paidAt: { gte: monthStart } }, _sum: { amountKrw: true } }),
  ]);

  const totalRam = nodes.reduce((sum, n) => sum + (n.totalRamMb - n.reservedRamMb), 0);
  const usedRam = activeServerList.reduce((sum, s) => sum + s.ramMb, 0);
  const ramSellRate = totalRam > 0 ? (usedRam / totalRam) * 100 : 0;

  const mrr = activeServerList.reduce((sum, s) => sum + (s.priceMonthlyKrwSnapshot ?? s.product?.priceMonthlyKrw ?? 0), 0);
  const avgRevenuePerServer = activeServerList.length > 0 ? mrr / activeServerList.length : 0;
  const avgRamGb = activeServerList.length > 0 ? usedRam / activeServerList.length / 1024 : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold">통계</h1>

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatTile label="전체 서버" value={totalServers} />
        <StatTile label="온라인 서버" value={activeServers} />
        <StatTile label="전체 유저" value={totalUsers} />
        <StatTile label="RAM 판매율" value={ramSellRate} unit="percent" />
        <StatTile label="평균 RAM/서버" value={avgRamGb} unit="gb" />
        <StatTile label="서버당 평균 매출" value={Math.round(avgRevenuePerServer)} unit="krw" />
        <StatTile label="월 반복 매출(MRR)" value={mrr} unit="krw" />
        <StatTile label="이번 달 실결제액" value={revenueThisMonth._sum.amountKrw ?? 0} unit="krw" />
        <StatTile label="이번 달 신규 서버" value={newServersThisMonth} />
        <StatTile label="최근 30일 해지 서버" value={churnedServersLast30d} />
      </div>

      <p className="mt-6 text-xs text-text-dim">
        MRR은 현재 활성 서버들의 상품 월 가격 합계 기준이며, 실제 결제 금액과는 쿠폰 할인 등으로 차이가 날 수 있습니다.
      </p>
    </div>
  );
}
