import { EmbedBuilder, TextChannel } from "discord.js";
import type { Client } from "discord.js";
import { prisma } from "./prismaClient";

const UPDATE_INTERVAL_MS = 60_000;

/**
 * 실시간 집계 현황판. 개별 고객 서버의 이름/상태 같은 비공개 정보는 절대 넣지 않고,
 * 플랫폼 전체 통계만 보여준다(가동 서버 수, 전체 서버 수, 노드 온라인 비율).
 * 정확한 실시간 접속 플레이어 수는 서버마다 콘솔 조회(웹소켓)가 필요해 비용이 커서
 * 이번 버전에서는 포함하지 않는다 — 있는 그대로의 수치만 보여주기 위한 의도적인 선택.
 */
export function startStatusBoard(client: Client) {
  updateStatusBoard(client).catch((err) => console.error("[statusBoard] 초기 업데이트 실패:", err));
  setInterval(() => {
    updateStatusBoard(client).catch((err) => console.error("[statusBoard] 업데이트 실패:", err));
  }, UPDATE_INTERVAL_MS);
}

async function updateStatusBoard(client: Client) {
  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });
  if (!settings?.statusBoardChannelId) return;

  const [runningCount, totalCount, nodes] = await Promise.all([
    prisma.server.count({ where: { deletedAt: null, status: "RUNNING" } }),
    prisma.server.count({ where: { deletedAt: null } }),
    prisma.hostNode.findMany({ select: { status: true } }),
  ]);
  const onlineNodes = nodes.filter((n) => n.status === "ONLINE").length;

  const embed = new EmbedBuilder()
    .setTitle("🖥️ Burnae 실시간 현황")
    .setColor(0xff6b35)
    .addFields(
      { name: "가동 중인 서버", value: `${runningCount}개`, inline: true },
      { name: "전체 등록 서버", value: `${totalCount}개`, inline: true },
      { name: "노드 상태", value: `${onlineNodes}/${nodes.length} 온라인`, inline: true },
    )
    .setFooter({ text: `${new Date().toLocaleTimeString("ko-KR")} 기준 · 1분마다 자동 갱신` });

  try {
    const channel = await client.channels.fetch(settings.statusBoardChannelId);
    if (!channel || !(channel instanceof TextChannel)) return;

    if (settings.statusBoardMessageId) {
      try {
        const message = await channel.messages.fetch(settings.statusBoardMessageId);
        await message.edit({ embeds: [embed] });
        return;
      } catch {
        // 메시지가 지워졌으면 새로 올린다
      }
    }

    const sent = await channel.send({ embeds: [embed] });
    await prisma.botSettings.update({ where: { id: 1 }, data: { statusBoardMessageId: sent.id } });
  } catch (err) {
    console.error("[statusBoard] 채널 접근 실패:", err);
  }
}
