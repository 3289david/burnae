import { TextChannel, VoiceChannel, MessageFlags } from "discord.js";
import type { Client } from "discord.js";
import { prisma } from "./prismaClient";
import { panel, heading, text, subtext } from "../lib/discordComponentsV2";

const UPDATE_INTERVAL_MS = 60_000;
/// 디스코드가 채널 이름 변경을 채널당 10분에 2번으로 제한해서 텍스트 현황판보다 느리게 돈다
const VOICE_STATS_INTERVAL_MS = 10 * 60_000;

/**
 * 실시간 집계 현황판. 개별 고객 서버의 이름/상태 같은 비공개 정보는 절대 넣지 않고,
 * 플랫폼 전체 통계만 보여준다(가동 서버 수, 전체 서버 수, 노드 온라인 비율).
 * 정확한 실시간 접속 플레이어 수는 서버마다 콘솔 조회(웹소켓)가 필요해 비용이 커서
 * 이번 버전에서는 포함하지 않는다 — 있는 그대로의 수치만 보여주기 위한 의도적인 선택.
 */
const SERVER_COUNT_MILESTONE_STEP = 50;

export function startStatusBoard(client: Client) {
  updateStatusBoard(client).catch((err) => console.error("[statusBoard] 초기 업데이트 실패:", err));
  setInterval(() => {
    updateStatusBoard(client).catch((err) => console.error("[statusBoard] 업데이트 실패:", err));
  }, UPDATE_INTERVAL_MS);

  updateStatsVoiceChannel(client).catch((err) => console.error("[statusBoard] 음성 채널 이름 초기 갱신 실패:", err));
  setInterval(() => {
    updateStatsVoiceChannel(client).catch((err) => console.error("[statusBoard] 음성 채널 이름 갱신 실패:", err));
  }, VOICE_STATS_INTERVAL_MS);

  checkServerCountMilestone(client).catch((err) => console.error("[statusBoard] 서버 수 마일스톤 확인 실패:", err));
  setInterval(() => {
    checkServerCountMilestone(client).catch((err) => console.error("[statusBoard] 서버 수 마일스톤 확인 실패:", err));
  }, UPDATE_INTERVAL_MS);
}

/** 전체 서버 수가 50의 배수를 새로 넘을 때마다 공지 채널에 축하 메시지를 올린다 — 핵심 성장
 * 지표를 숨기지 않고 커뮤니티와 같이 축하하기 위함 */
async function checkServerCountMilestone(client: Client) {
  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });
  if (!settings?.announcementChannelId) return;

  const totalCount = await prisma.server.count({ where: { deletedAt: null } });
  const milestone = Math.floor(totalCount / SERVER_COUNT_MILESTONE_STEP) * SERVER_COUNT_MILESTONE_STEP;
  if (milestone === 0 || milestone <= settings.lastServerCountMilestone) return;

  try {
    const channel = await client.channels.fetch(settings.announcementChannelId);
    if (!channel || !(channel instanceof TextChannel)) return;
    const container = panel(0xfbbf24)
      .addTextDisplayComponents(heading("🎉 서버 수 마일스톤 달성!"))
      .addTextDisplayComponents(text(`Burnae에서 운영 중인 서버가 **${milestone.toLocaleString()}개**를 넘었어요! 함께해주신 모든 분들 감사해요 🙌`));
    await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
    await prisma.botSettings.update({ where: { id: 1 }, data: { lastServerCountMilestone: milestone } });
  } catch (err) {
    console.error("[statusBoard] 서버 수 마일스톤 공지 실패:", err);
  }
}

async function getPlatformStats() {
  const [runningCount, totalCount, nodes] = await Promise.all([
    prisma.server.count({ where: { deletedAt: null, status: "RUNNING" } }),
    prisma.server.count({ where: { deletedAt: null } }),
    prisma.hostNode.findMany({ select: { status: true } }),
  ]);
  const onlineNodes = nodes.filter((n) => n.status === "ONLINE").length;
  return { runningCount, totalCount, onlineNodes, totalNodes: nodes.length };
}

/** 채널 목록에서 클릭 안 해도 바로 보이는 "🟢 가동중 N/M" 음성 채널 이름 — 10분마다 갱신 */
async function updateStatsVoiceChannel(client: Client) {
  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });
  if (!settings?.statsVoiceChannelId) return;

  const { runningCount, totalCount } = await getPlatformStats();
  const name = `🟢 가동중 ${runningCount}/${totalCount}`;

  try {
    const channel = await client.channels.fetch(settings.statsVoiceChannelId);
    if (!channel || !(channel instanceof VoiceChannel)) return;
    if (channel.name === name) return; // 같으면 호출 자체를 안 해서 레이트리밋을 아낀다
    await channel.setName(name);
  } catch (err) {
    console.error("[statusBoard] 음성 채널 이름 변경 실패:", err);
  }
}

async function updateStatusBoard(client: Client) {
  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });
  if (!settings?.statusBoardChannelId) return;

  const { runningCount, totalCount, onlineNodes, totalNodes } = await getPlatformStats();

  const container = panel()
    .addTextDisplayComponents(heading("🖥️ Burnae 실시간 현황"))
    .addTextDisplayComponents(
      text(
        `**가동 중인 서버**  ${runningCount}개\n**전체 등록 서버**  ${totalCount}개\n**운영 상태**  ${onlineNodes}/${totalNodes} 정상`,
      ),
    )
    .addTextDisplayComponents(subtext(`${new Date().toLocaleTimeString("ko-KR")} 기준 · 1분마다 자동 갱신`));

  try {
    const channel = await client.channels.fetch(settings.statusBoardChannelId);
    if (!channel || !(channel instanceof TextChannel)) return;

    if (settings.statusBoardMessageId) {
      try {
        const message = await channel.messages.fetch(settings.statusBoardMessageId);
        await message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
        return;
      } catch {
        // 메시지가 지워졌으면 새로 올린다
      }
    }

    const sent = await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
    await prisma.botSettings.update({ where: { id: 1 }, data: { statusBoardMessageId: sent.id } });
  } catch (err) {
    console.error("[statusBoard] 채널 접근 실패:", err);
  }
}
