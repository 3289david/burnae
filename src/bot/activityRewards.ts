import type { Client, GuildMember, Message, PartialGuildMember } from "discord.js";
import { Events, MessageFlags } from "discord.js";
import { prisma } from "./prismaClient";
import { panel, heading, text } from "../lib/discordComponentsV2";

/** 총 누적 포인트가 이 기준을 넘을 때마다 1회 DM으로 축하 메시지를 보낸다 */
const POINT_MILESTONES = [1000, 5000, 10000, 50000, 100000];

/** 채팅 포인트는 이 두 카테고리(채팅 채널, 음성 채널) 안의 텍스트 채널에서만 인정한다 —
 * 운영/관리자 채널 등 포인트 목적이 아닌 곳에서의 채팅은 대상에서 제외 */
const CHAT_POINT_ALLOWED_CATEGORY_IDS = new Set(["1542132019818008620", "1542132020040437774"]);

/**
 * 포인트가 1원=1포인트로 현금과 그대로 맞바꿔지는 값이 됐기 때문에(지난 글자수 기반 보상은
 * 이론상 "스팸 → 시간당 수십만 포인트" 수준으로 현금을 그냥 찍어내는 구멍이었다), 채팅 보상은
 * 메시지당 소액 고정 지급 + 느슨한 쿨다운 + 일일 상한 3중으로 묶어서 적은 금액만 안정적으로
 * 흘러나가게 한다.
 */
const POINTS_PER_MESSAGE = 1;
/** 너무 짧은 메시지("ㅇㅇ", 이모지 하나)로는 보상을 노리지 못하게 최소 글자 수를 요구한다 */
const MIN_MESSAGE_LENGTH = 5;
/** 같은 유저가 연속으로 포인트를 받을 수 있는 최소 간격 */
const CHAT_REWARD_COOLDOWN_MS = 60_000;
/** 쿨다운을 우회해도(예: 재시작) 하루에 받을 수 있는 채팅 포인트 총액을 이 이상 못 넘게 막는다 */
const CHAT_DAILY_CAP = 100;

/** 서버 태그(프로필 꾸미기) 착용 1시간당 지급 포인트 — 가만히 켜두기만 하면 되는 활동이라 낮게 유지 */
const POINTS_PER_TAG_HOUR = 2;
const TAG_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** 서버 부스트 시작 1회당 지급 포인트 — 부스트 자체가 실제 돈이 드는 행동이라 예외적으로 높게 유지 */
const POINTS_PER_BOOST = 2000;

/** "인증완료" 역할(전화번호 인증 등으로 운영자가 직접 부여) — 이 역할을 받는 순간 1회 지급 */
const VERIFIED_TITLE_ROLE_ID = "1562815337194594406";
const POINTS_PER_VERIFIED_TITLE = 100;

const lastChatRewardAt = new Map<string, number>();
const chatDailyTotal = new Map<string, { day: string; points: number }>();
/** 60초 쿨다운만으로는 "같은 문장 반복 전송"으로 느리게 도배하며 포인트를 긁는 걸 못 막는다 —
 * 직전에 보상받은 메시지와 내용이 같으면 쿨다운을 지켰어도 보상하지 않는다 */
const lastRewardedContent = new Map<string, string>();

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function awardToDiscordUser(client: Client, discordUserId: string, points: number, reason: string): Promise<boolean> {
  const link = await prisma.discordLink.findUnique({ where: { discordUserId } });
  if (!link) {
    console.log(`[activityRewards] ${discordUserId} 미연동 계정이라 지급 안 함 (${reason})`);
    return false;
  }
  const before = await prisma.user.findUniqueOrThrow({ where: { id: link.userId }, select: { promotionPoints: true } });
  const after = await prisma.user.update({
    where: { id: link.userId },
    data: { promotionPoints: { increment: points } },
    select: { promotionPoints: true },
  });
  console.log(`[activityRewards] ${discordUserId} +${points}P (${reason})`);

  const crossed = POINT_MILESTONES.find((m) => before.promotionPoints < m && after.promotionPoints >= m);
  if (crossed) {
    await announceMilestone(client, discordUserId, crossed).catch((err) =>
      console.error("[activityRewards] 마일스톤 DM 실패:", err),
    );
  }
  return true;
}

/** 서버 부스트는 조용히 포인트만 지급하지 말고 공개로 감사 인사를 남긴다 — 메인 공지(업데이트/중요
 * 사안)와 구분된 서브 공지 채널(덜 중요한 알림)에 올린다 */
async function announceBoost(member: GuildMember) {
  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });
  if (!settings?.subAnnouncementChannelId) return;
  const channel = await member.guild.channels.fetch(settings.subAnnouncementChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const container = panel(0xf472b6)
    .addTextDisplayComponents(heading("💎 서버 부스트 감사해요!"))
    .addTextDisplayComponents(text(`**${member.user.tag}** 님이 서버를 부스트해주셨어요! 소중한 지원 감사합니다.`));
  await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function announceMilestone(client: Client, discordUserId: string, milestone: number) {
  const user = await client.users.fetch(discordUserId).catch(() => null);
  if (!user) return;
  const container = panel()
    .addTextDisplayComponents(heading("🎉 포인트 마일스톤 달성!"))
    .addTextDisplayComponents(
      text(`누적 홍보 포인트 **${milestone.toLocaleString()}점**을 넘었어요! \`/포인트순위\`에서 내 순위를 확인해보세요.`),
    );
  await user.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {
    // DM 막아둔 유저면 조용히 무시
  });
}

function handleMessageCreate(client: Client, message: Message, officialGuildId: string) {
  if (message.guildId !== officialGuildId) return;
  if (message.author.bot) return;

  const parentId = "parentId" in message.channel ? message.channel.parentId : null;
  if (!parentId || !CHAT_POINT_ALLOWED_CATEGORY_IDS.has(parentId)) return;

  const content = message.content.trim();
  if (content.length < MIN_MESSAGE_LENGTH) {
    // 글자 수 미달(5자 미만)은 여태 조용히 넘어갔는데, "왜 포인트가 안 들어오냐"는 혼란의
    // 큰 원인이었다 — 채널까지 같이 남겨서 어디서 무시됐는지 바로 알 수 있게 한다
    console.log(
      `[activityRewards] ${message.author.id} 메시지 너무 짧음(${content.length}자, 최소 ${MIN_MESSAGE_LENGTH}자) — ch:${message.channelId}`,
    );
    return;
  }

  const now = Date.now();
  const last = lastChatRewardAt.get(message.author.id) ?? 0;
  if (now - last < CHAT_REWARD_COOLDOWN_MS) {
    console.log(
      `[activityRewards] ${message.author.id} 쿨다운 중(${Math.ceil((CHAT_REWARD_COOLDOWN_MS - (now - last)) / 1000)}초 남음) — ch:${message.channelId}`,
    );
    return;
  }

  const normalizedContent = content.toLowerCase();
  if (lastRewardedContent.get(message.author.id) === normalizedContent) {
    console.log(`[activityRewards] ${message.author.id} 직전 보상 메시지와 내용 동일 — 반복 도배 의심, 지급 안 함 — ch:${message.channelId}`);
    return;
  }

  const today = todayKey();
  const record = chatDailyTotal.get(message.author.id);
  const soFar = record?.day === today ? record.points : 0;
  if (soFar >= CHAT_DAILY_CAP) {
    console.log(`[activityRewards] ${message.author.id} 오늘 일일 한도(${CHAT_DAILY_CAP}P) 도달 — ch:${message.channelId}`);
    return;
  }

  lastChatRewardAt.set(message.author.id, now);
  lastRewardedContent.set(message.author.id, normalizedContent);
  chatDailyTotal.set(message.author.id, { day: today, points: soFar + POINTS_PER_MESSAGE });

  awardToDiscordUser(client, message.author.id, POINTS_PER_MESSAGE, `채팅(ch:${message.channelId})`).catch((err) =>
    console.error("[activityRewards] 채팅 지급 실패:", err),
  );
}

function handleGuildMemberUpdate(
  client: Client,
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember,
  officialGuildId: string,
) {
  if (newMember.guild.id !== officialGuildId) return;

  const startedBoosting = !oldMember.premiumSince && newMember.premiumSince;
  if (startedBoosting) {
    awardToDiscordUser(client, newMember.id, POINTS_PER_BOOST, "서버 부스트").catch((err) => console.error("[activityRewards] 부스트 지급 실패:", err));
    announceBoost(newMember).catch((err) => console.error("[activityRewards] 부스트 감사 메시지 실패:", err));
  }

  const gainedVerifiedTitle =
    !oldMember.roles.cache.has(VERIFIED_TITLE_ROLE_ID) && newMember.roles.cache.has(VERIFIED_TITLE_ROLE_ID);
  if (gainedVerifiedTitle) {
    awardToDiscordUser(client, newMember.id, POINTS_PER_VERIFIED_TITLE, "인증완료").catch((err) =>
      console.error("[activityRewards] 인증완료 지급 실패:", err),
    );
  }
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
    await awardToDiscordUser(client, member.id, POINTS_PER_TAG_HOUR, "서버 태그 착용").catch((err) =>
      console.error("[activityRewards] 서버 태그 지급 실패:", err),
    );
  }
}

/**
 * 디스코드 활동(채팅/서버 태그/부스트)으로 포인트를 지급한다. 연동(DiscordLink)된 계정만
 * 대상이며, 공식 서버(officialGuildId) 밖의 활동은 무시한다.
 */
export function startActivityRewards(client: Client, officialGuildId: string) {
  client.on(Events.MessageCreate, (message) => handleMessageCreate(client, message, officialGuildId));
  client.on(Events.GuildMemberUpdate, (oldMember, newMember) => handleGuildMemberUpdate(client, oldMember, newMember, officialGuildId));

  setInterval(() => {
    checkServerTags(client, officialGuildId).catch((err) => console.error("[activityRewards] 서버 태그 점검 오류:", err));
  }, TAG_CHECK_INTERVAL_MS);
}
