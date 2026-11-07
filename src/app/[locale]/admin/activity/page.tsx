import { prisma } from "@/lib/prisma";
import StatTile from "@/components/StatTile";

export default async function AdminActivityPage() {
  const [totalTracked, aggregate, top] = await Promise.all([
    prisma.userActivityLevel.count(),
    prisma.userActivityLevel.aggregate({ _sum: { xp: true, messageCount: true }, _avg: { level: true } }),
    prisma.userActivityLevel.findMany({ orderBy: { xp: "desc" }, take: 50 }),
  ]);

  const averageLevel = Math.round((aggregate._avg.level ?? 0) * 10) / 10;

  return (
    <div>
      <h1 className="text-2xl font-bold">유저 활동 분석</h1>
      <p className="text-sm text-text-dim mt-1">
        채팅 레벨링(XP) 집계 — 포인트(현금 교환 가능)와는 별개로, Burnae 계정 연동 여부와 무관하게 디스코드에서 채팅한 모든 유저가 대상이에요.
      </p>

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatTile label="추적 중인 유저" value={totalTracked} />
        <StatTile label="누적 메시지(보상 대상)" value={aggregate._sum.messageCount ?? 0} />
        <StatTile label="누적 XP" value={aggregate._sum.xp ?? 0} />
        <StatTile label="평균 레벨" value={averageLevel} />
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
                <th className="py-2 pr-3">XP</th>
                <th className="py-2 pr-3">메시지 수</th>
              </tr>
            </thead>
            <tbody>
              {top.map((row, i) => (
                <tr key={row.id} className="border-b border-border/50">
                  <td className="py-2 pr-3 text-text-dim">{i + 1}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{row.discordUserId}</td>
                  <td className="py-2 pr-3">{row.level}</td>
                  <td className="py-2 pr-3">{row.xp.toLocaleString()}</td>
                  <td className="py-2 pr-3">{row.messageCount.toLocaleString()}</td>
                </tr>
              ))}
              {top.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-text-dim">아직 데이터가 없어요.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
