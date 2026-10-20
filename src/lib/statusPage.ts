import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

const UPTIME_WINDOW_DAYS = 90;

export function generateStatusPageSlug(): string {
  return randomBytes(5).toString("hex");
}

export interface StatusPageData {
  serverName: string;
  isUp: boolean;
  uptimePercent: number;
  incidents: { startedAt: Date; endedAt: Date | null }[];
}

/** 최근 90일 가동률(%) + 장애 이력. 진행 중인 장애는 endedAt=null로, 지금까지의 구간만 다운타임에 포함한다 */
export async function getStatusPageData(slug: string): Promise<StatusPageData | null> {
  const server = await prisma.server.findUnique({
    where: { statusPageSlug: slug },
    select: { id: true, name: true, statusPageEnabled: true },
  });
  if (!server || !server.statusPageEnabled) return null;

  const windowStart = new Date(Date.now() - UPTIME_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [incidents, openIncident] = await Promise.all([
    prisma.uptimeIncident.findMany({
      where: { serverId: server.id, startedAt: { gte: windowStart } },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true, endedAt: true },
    }),
    prisma.uptimeIncident.findFirst({ where: { serverId: server.id, endedAt: null } }),
  ]);

  const now = Date.now();
  const windowMs = now - windowStart.getTime();
  const downMs = incidents.reduce((sum, inc) => {
    const start = Math.max(inc.startedAt.getTime(), windowStart.getTime());
    const end = inc.endedAt?.getTime() ?? now;
    return sum + Math.max(0, end - start);
  }, 0);
  const uptimePercent = windowMs > 0 ? Math.max(0, Math.min(100, (1 - downMs / windowMs) * 100)) : 100;

  return {
    serverName: server.name,
    isUp: !openIncident,
    uptimePercent: Math.round(uptimePercent * 100) / 100,
    incidents,
  };
}
