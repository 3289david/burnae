import type { Client } from "discord.js";
import { prisma } from "./prismaClient";
import { PteroClient } from "../lib/pterodactyl";

const lastKnownState = new Map<string, string>();
const WATCH_INTERVAL_MS = 60_000;

/**
 * 소유자가 직접 정지하지 않았는데 서버가 예기치 않게 offline이 되면 디스코드 DM으로 알린다.
 * (관리자가 콘솔에서 크래시를 보기 전에 고객이 먼저 알 수 있도록)
 */
export function startCrashWatcher(client: Client) {
  setInterval(async () => {
    try {
      await checkAllServers(client);
    } catch (err) {
      console.error("[watcher] 오류:", err);
    }
  }, WATCH_INTERVAL_MS);
}

async function checkAllServers(client: Client) {
  const servers = await prisma.server.findMany({
    where: { deletedAt: null, status: "RUNNING", pterodactylIdentifier: { not: null } },
    include: { owner: { include: { discordLink: true } } },
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

    const crashed = prevState === "running" && currentState === "offline";
    if (!crashed) continue;

    const discordUserId = server.owner.discordLink?.discordUserId;
    if (!discordUserId) continue;

    try {
      const user = await client.users.fetch(discordUserId);
      await user.send(
        `🔴 **${server.name}** 서버가 예기치 않게 종료된 것 같아요. Burnae 대시보드에서 콘솔 로그를 확인해보세요.`,
      );
    } catch (err) {
      console.error("[watcher] DM 발송 실패:", err);
    }
  }
}
