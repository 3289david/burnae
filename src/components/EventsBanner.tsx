import { Gift } from "lucide-react";
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
        <div key={e.id} className="card p-4 flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-accent/10 to-transparent">
          <div className="min-w-0 flex items-start gap-2">
            <Gift size={16} className="text-accent shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-semibold text-sm">{e.title}</p>
              <p className="text-xs text-text-dim mt-0.5">{e.description}</p>
            </div>
          </div>
          {e.coupon && (
            <span className="text-xs font-mono bg-surface-2 px-2 py-1 rounded shrink-0">{e.coupon.code}</span>
          )}
        </div>
      ))}
    </div>
  );
}
