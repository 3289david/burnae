import { prisma } from "./prismaClient";
import { PteroClient } from "../lib/pterodactyl";
import { notifyServerEvent } from "../lib/notify";

const lastKnownState = new Map<string, string>();
const WATCH_INTERVAL_MS = 60_000;

/**
 * 소유자가 직접 정지하지 않았는데 서버가 예기치 않게 offline이 되면 알린다(디스코드 DM +
 * 설정된 외부 웹훅). 공개 상태 페이지(statusPage.ts)가 쓰는 UptimeIncident도 여기서 같이
 * 기록한다 — HTTP 헬스체크가 없는 서버(마인크래프트/봇 등)도 "다운" 판정을 받을 수 있게 됨.
 * autoRestartOnCrash를 켜둔 서버는 감지 즉시 자동으로 재시작한다.
 */
export function startCrashWatcher() {
  setInterval(async () => {
    try {
      await checkAllServers();
    } catch (err) {
      console.error("[watcher] 오류:", err);
    }
  }, WATCH_INTERVAL_MS);
}

async function checkAllServers() {
  const servers = await prisma.server.findMany({
    where: { deletedAt: null, status: "RUNNING", pterodactylIdentifier: { not: null } },
  });

  for (const server of servers) {
    if (!server.pterodactylIdentifier) continue;
    let currentState: string;
    try {
      const resources = await PteroClient.getServerResources(server.pterodactylIdentifier);
      currentState = resources.current_state;
    } catch {
      continue;
    }

    const prevState = lastKnownState.get(server.id);
    lastKnownState.set(server.id, currentState);

    if (prevState === "running" && currentState === "offline") {
      const openIncident = await prisma.uptimeIncident.findFirst({ where: { serverId: server.id, endedAt: null } });
      if (!openIncident) {
        await prisma.uptimeIncident.create({ data: { serverId: server.id } });
      }
      await notifyServerEvent(server, `🔴 **${server.name}** 서버가 예기치 않게 종료된 것 같아요. Burnae 대시보드에서 콘솔 로그를 확인해보세요.`);

      if (server.autoRestartOnCrash) {
        try {
          await PteroClient.sendPowerAction(server.pterodactylIdentifier, "restart");
          await notifyServerEvent(server, `🚑 **${server.name}** 크래시를 감지해서 자동으로 재시작했어요.`);
        } catch (err) {
          console.error(`[watcher] ${server.name} 자동 재시작 실패:`, err);
        }
      }
      continue;
    }

    if (prevState && prevState !== "running" && currentState === "running") {
      const openIncident = await prisma.uptimeIncident.findFirst({ where: { serverId: server.id, endedAt: null } });
      if (openIncident) {
        await prisma.uptimeIncident.update({ where: { id: openIncident.id }, data: { endedAt: new Date() } });
        await notifyServerEvent(server, `✅ **${server.name}** 서버가 다시 정상적으로 켜졌어요.`);
      }
    }
  }
}
