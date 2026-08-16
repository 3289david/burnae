import { prisma } from "@/lib/prisma";

export default async function EventsBanner() {
  const now = new Date();
  const events = await prisma.event.findMany({
    where: { active: true, startsAt: { lte: now }, endsAt: { gte: now } },
    orderBy: { startsAt: "desc" },
    include: { coupon: true },
    take: 3,
  });

  if (events.length === 0) return null;

  return (
    <div className="space-y-2 mb-6">
      {events.map((e) => (
        <div key={e.id} className="card p-4 flex items-center justify-between bg-gradient-to-r from-accent/10 to-transparent">
          <div>
            <p className="font-semibold text-sm">🎉 {e.title}</p>
            <p className="text-xs text-text-dim mt-0.5">{e.description}</p>
          </div>
          {e.coupon && (
            <span className="text-xs font-mono bg-surface-2 px-2 py-1 rounded">{e.coupon.code}</span>
          )}
        </div>
      ))}
    </div>
  );
}
