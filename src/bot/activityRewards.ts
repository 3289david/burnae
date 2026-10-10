import type { Client, GuildMember, Message, PartialGuildMember } from "discord.js";
import { Events } from "discord.js";
import { prisma } from "./prismaClient";

/** 채팅 1자당 지급 포인트 */
const POINTS_PER_CHAT_CHAR = 1;
/** 메시지 하나로 노려볼 수 있는 최대 글자 수 — 긴 글 복붙 한 번으로 포인트를 몰아 받는 걸 막음 */
const MAX_CHARS_PER_MESSAGE = 300;
/** 같은 유저가 연속으로 포인트를 받을 수 있는 최소 간격(초) — 짧은 메시지 스팸 매크로 방지 */
const CHAT_REWARD_COOLDOWN_MS = 5_000;

/** 서버 태그(프로필 꾸미기) 착용 1시간당 지급 포인트 — 가만히 켜두기만 하면 되는 활동이라 낮게 유지 */
const POINTS_PER_TAG_HOUR = 5;
const TAG_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** 서버 부스트 시작 1회당 지급 포인트 */
const POINTS_PER_BOOST = 2000;

const lastChatRewardAt = new Map<string, number>();

async function awardToDiscordUser(discordUserId: string, points: number, reason: string) {
  const link = await prisma.discordLink.findUnique({ where: { discordUserId } });
  if (!link) return;
  await prisma.user.update({ where: { id: link.userId }, data: { promotionPoints: { increment: points } } });
  console.log(`[activityRewards] ${discordUserId} +${points}P (${reason})`);
}

function handleMessageCreate(message: Message, officialGuildId: string) {
  if (message.guildId !== officialGuildId) return;
  if (message.author.bot) return;

  const content = message.content.trim();
  if (content.length === 0) return;

  const now = Date.now();
  const last = lastChatRewardAt.get(message.author.id) ?? 0;
  if (now - last < CHAT_REWARD_COOLDOWN_MS) return;
  lastChatRewardAt.set(message.author.id, now);

  const points = Math.min(content.length, MAX_CHARS_PER_MESSAGE) * POINTS_PER_CHAT_CHAR;
  awardToDiscordUser(message.author.id, points, "채팅").catch((err) => console.error("[activityRewards] 채팅 지급 실패:", err));
}

function handleGuildMemberUpdate(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember, officialGuildId: string) {
  if (newMember.guild.id !== officialGuildId) return;
  const startedBoosting = !oldMember.premiumSince && newMember.premiumSince;
  if (!startedBoosting) return;
  awardToDiscordUser(newMember.id, POINTS_PER_BOOST, "서버 부스트").catch((err) => console.error("[activityRewards] 부스트 지급 실패:", err));
}

/** 매 시간마다 그 순간 서버 태그를 켜둔 멤버 전원에게 한 시간치 포인트를 지급한다 */
async function checkServerTags(client: Client, officialGuildId: string) {
  const guild = await client.guilds.fetch(officialGuildId).catch(() => null);
  if (!guild) return;
  const members = await guild.members.fetch().catch(() => null);
  if (!members) return;

  for (const member of members.values()) {
    if (member.user.bot) continue;
    const tag = member.user.primaryGuild;
    if (!tag || !tag.identityEnabled || tag.identityGuildId !== officialGuildId) continue;
    await awardToDiscordUser(member.id, POINTS_PER_TAG_HOUR, "서버 태그 착용").catch((err) =>
      console.error("[activityRewards] 서버 태그 지급 실패:", err),
    );
  }
}

/**
 * 디스코드 활동(채팅/서버 태그/부스트)으로 포인트를 지급한다. 연동(DiscordLink)된 계정만
 * 대상이며, 공식 서버(officialGuildId) 밖의 활동은 무시한다.
 */
export function startActivityRewards(client: Client, officialGuildId: string) {
  client.on(Events.MessageCreate, (message) => handleMessageCreate(message, officialGuildId));
  client.on(Events.GuildMemberUpdate, (oldMember, newMember) => handleGuildMemberUpdate(oldMember, newMember, officialGuildId));

  setInterval(() => {
    checkServerTags(client, officialGuildId).catch((err) => console.error("[activityRewards] 서버 태그 점검 오류:", err));
  }, TAG_CHECK_INTERVAL_MS);
}
