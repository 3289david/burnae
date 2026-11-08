import PageHeader from "@/components/PageHeader";
import { prisma } from "@/lib/prisma";
import StatTile from "@/components/StatTile";
import { levelForPoints } from "@/lib/levels";
import LevelRoleManager from "@/components/admin/LevelRoleManager";

export default async function AdminActivityPage() {
  const [totalLinked, aggregate, top] = await Promise.all([
    prisma.user.count({ where: { discordLink: { isNot: null } } }),
    prisma.user.aggregate({ where: { discordLink: { isNot: null } }, _sum: { promotionPoints: true } }),
    prisma.user.findMany({
      where: { promotionPoints: { gt: 0 }, discordLink: { isNot: null } },
      orderBy: { promotionPoints: "desc" },
      take: 50,
      include: { discordLink: true },
    }),
  ]);

  const totalPoints = aggregate._sum.promotionPoints ?? 0;
  const averageLevel =
    top.length > 0 ? Math.round((top.reduce((sum, u) => sum + levelForPoints(u.promotionPoints), 0) / top.length) * 10) / 10 : 0;

  return (
    <div>
      <PageHeader art="admin" title="유저 활동 분석" />
      <p className="text-sm text-text-dim mt-1">채팅 레벨은 보유 포인트로 계산돼요.</p>

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatTile label="연동된 유저" value={totalLinked} />
        <StatTile label="연동 유저 보유 포인트 합계" value={totalPoints} />
        <StatTile label="평균 레벨(TOP 50 기준)" value={averageLevel} />
        <StatTile label="포인트 보유 유저 수" value={top.length} />
      </div>

      <div className="card-glow p-5 mt-6">
        <h2 className="font-semibold mb-3">활동 랭킹 TOP 50</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-dim border-b border-border">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">디스코드 유저 ID</th>
                <th className="py-2 pr-3">레벨</th>
                <th className="py-2 pr-3">보유 포인트</th>
              </tr>
            </thead>
            <tbody>
              {top.map((u, i) => (
                <tr key={u.id} className="border-b border-border/50">
                  <td className="py-2 pr-3 text-text-dim">{i + 1}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{u.discordLink?.discordUserId ?? "-"}</td>
                  <td className="py-2 pr-3">{levelForPoints(u.promotionPoints)}</td>
                  <td className="py-2 pr-3">{u.promotionPoints.toLocaleString()}P</td>
                </tr>
              ))}
              {top.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-text-dim">아직 데이터가 없어요.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <LevelRoleManager />
    </div>
  );
}
