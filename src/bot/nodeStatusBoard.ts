import { TextChannel, MessageFlags } from "discord.js";
import type { Client } from "discord.js";
import { prisma } from "./prismaClient";
import { panel, heading, text, subtext } from "../lib/discordComponentsV2";

const UPDATE_INTERVAL_MS = 5 * 60_000;

/**
 * 관리자용 노드 점유율 현황판. 과거엔 3시간마다 관리자 DM으로 보냈는데(maintenance-cron.ts의
 * handleUtilizationReport, 제거됨), DM은 과거 기록을 못 보고 매번 새 메시지라 번거로워서
 * /노드상태패널로 채널에 한 번 설치해두면 statusBoard.ts와 같은 방식으로 같은 메시지를 계속
 * 고쳐가며 최신 점유율을 보여주는 패널로 바꿨다.
 */
export function startNodeStatusBoard(client: Client) {
  updateNodeStatusBoard(client).catch((err) => console.error("[nodeStatusBoard] 초기 업데이트 실패:", err));
  setInterval(() => {
    updateNodeStatusBoard(client).catch((err) => console.error("[nodeStatusBoard] 업데이트 실패:", err));
  }, UPDATE_INTERVAL_MS);
}

export async function updateNodeStatusBoard(client: Client) {
  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });
  if (!settings?.nodeStatusChannelId) return;

  const container = await buildNodeStatusContainer();

  try {
    const channel = await client.channels.fetch(settings.nodeStatusChannelId);
    if (!channel || !(channel instanceof TextChannel)) return;

    if (settings.nodeStatusMessageId) {
      try {
        const message = await channel.messages.fetch(settings.nodeStatusMessageId);
        await message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
        return;
      } catch {
        // 메시지가 지워졌으면 새로 올린다
      }
    }

    const sent = await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
    await prisma.botSettings.update({ where: { id: 1 }, data: { nodeStatusMessageId: sent.id } });
  } catch (err) {
    console.error("[nodeStatusBoard] 채널 접근 실패:", err);
  }
}

/** 노드별 RAM/CPU/저장공간 판매(점유)율 패널 — /노드상태패널 설치 직후와 주기 갱신 둘 다 이걸 쓴다 */
export async function buildNodeStatusContainer() {
  const nodes = await prisma.hostNode.findMany();
  const usage = await prisma.server.groupBy({
    by: ["nodeId"],
    where: { deletedAt: null },
    _sum: { ramMb: true, cpuPercent: true, diskMb: true },
    _count: true,
  });
  const usageMap = new Map(usage.map((u) => [u.nodeId, u]));

  const container = panel().addTextDisplayComponents(heading("📊 노드 점유율"));
  if (nodes.length === 0) {
    container.addTextDisplayComponents(text("등록된 노드가 없어요."));
  } else {
    for (const node of nodes) {
      const u = usageMap.get(node.id);
      const sellableRam = node.totalRamMb - node.reservedRamMb;
      const sellableDisk = node.totalDiskMb - node.reservedDiskMb;
      const sellableCpu = node.cpuCores * 100;
      const ramPct = sellableRam > 0 ? ((u?._sum.ramMb ?? 0) / sellableRam) * 100 : 0;
      const cpuPct = sellableCpu > 0 ? ((u?._sum.cpuPercent ?? 0) / sellableCpu) * 100 : 0;
      const diskPct = sellableDisk > 0 ? ((u?._sum.diskMb ?? 0) / sellableDisk) * 100 : 0;
      container.addTextDisplayComponents(
        text(
          `**${node.name}**(${node.location}) — ${node.status === "ONLINE" ? "🟢" : "🔴"} 서버 ${u?._count ?? 0}개\n` +
            `RAM ${ramPct.toFixed(1)}% · CPU ${cpuPct.toFixed(1)}% · 저장공간 ${diskPct.toFixed(1)}%`,
        ),
      );
    }
  }
  container.addTextDisplayComponents(subtext(`${new Date().toLocaleTimeString("ko-KR")} 기준 · 5분마다 자동 갱신`));
  return container;
}
