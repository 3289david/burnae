import type {
  Client,
  GuildMember,
  Message,
  PartialGuildMember,
  VoiceState,
  MessageReaction,
  PartialMessageReaction,
  User,
  PartialUser,
} from "discord.js";
import { Events, MessageFlags } from "discord.js";
import { prisma } from "./prismaClient";
import { panel, heading, text } from "../lib/discordComponentsV2";
import { pointsForLevel, levelForPoints } from "../lib/levels";

export { pointsForLevel, levelForPoints };

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

/**
 * 레벨 n에 도달하면 관리자가 LevelRole로 정해둔 "그 레벨 이하에서 가장 높은 등급" 역할 하나만
 * 갖도록 맞춘다 — 다른 등급 역할은 있으면 빼고, 목표 등급 역할은 없으면 더해준다. 등수가
 * 아니라 "지금 몇 레벨인지"로 매번 다시 계산해서 적용하므로, DB에 "지금 들고 있는 역할"을
 * 따로 저장할 필요가 없다(멤버의 실제 역할 목록을 그대로 진실의 원천으로 쓴다).
 */
async function applyLevelRole(client: Client, guildId: string, discordUserId: string, newLevel: number) {
  const levelRoles = await prisma.levelRole.findMany({ orderBy: { level: "asc" } });
  if (levelRoles.length === 0) return;

  const target = [...levelRoles].reverse().find((r) => r.level <= newLevel);
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;
  const member = await guild.members.fetch(discordUserId).catch(() => null);
  if (!member) return;

  const allTierRoleIds = new Set(levelRoles.map((r) => r.discordRoleId));
  for (const roleId of member.roles.cache.keys()) {
    if (allTierRoleIds.has(roleId) && roleId !== target?.discordRoleId) {
      await member.roles.remove(roleId).catch((err) => console.error("[activityRewards] 이전 등급 역할 제거 실패:", err));
    }
  }
  if (target && !member.roles.cache.has(target.discordRoleId)) {
    await member.roles.add(target.discordRoleId).catch((err) => console.error("[activityRewards] 등급 역할 부여 실패:", err));
  }
}

async function announceLevelUp(client: Client, discordUserId: string, newLevel: number) {
  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });
  if (!settings?.subAnnouncementChannelId) return;
  const channel = await client.channels.fetch(settings.subAnnouncementChannelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !("send" in channel)) return;

  const container = panel(0x60a5fa)
    .addTextDisplayComponents(heading("⭐ 레벨업!"))
    .addTextDisplayComponents(text(`<@${discordUserId}> 님이 레벨 **${newLevel}**이 됐어요! \`/레벨순위\`에서 확인해보세요.`));
  await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
}

const lastChatRewardAt = new Map<string, number>();
const chatDailyTotal = new Map<string, { day: string; points: number }>();
/** 60초 쿨다운만으로는 "같은 문장 반복 전송"으로 느리게 도배하며 포인트를 긁는 걸 못 막는다 —
 * 직전에 보상받은 메시지와 내용이 같으면 쿨다운을 지켰어도 보상하지 않는다 */
const lastRewardedContent = new Map<string, string>();

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 포인트를 지급하는 모든 경로(채팅/부스트/인증완료/서버태그)가 공용으로 쓴다. before/after
 * 포인트를 어차피 마일스톤 판정용으로 구하므로, 레벨업 감지(+등급 역할 재적용)도 같이 끼워 넣었다 —
 * 레벨이 더 이상 별도로 안 쌓이고 포인트에서 바로 계산되므로 이 함수 하나로 전부 처리된다.
 */
export async function awardToDiscordUser(client: Client, guildId: string, discordUserId: string, points: number, reason: string): Promise<boolean> {
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

  const levelBefore = levelForPoints(before.promotionPoints);
  const levelAfter = levelForPoints(after.promotionPoints);
  if (levelAfter > levelBefore) {
    await announceLevelUp(client, discordUserId, levelAfter).catch((err) => console.error("[activityRewards] 레벨업 알림 실패:", err));
    await applyLevelRole(client, guildId, discordUserId, levelAfter).catch((err) => console.error("[activityRewards] 등급 역할 적용 실패:", err));
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
      text(`누적 포인트 **${milestone.toLocaleString()}점**을 넘었어요! \`/포인트순위\`에서 내 순위를 확인해보세요.`),
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

  awardToDiscordUser(client, officialGuildId, message.author.id, POINTS_PER_MESSAGE, `채팅(ch:${message.channelId})`).catch((err) =>
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
    awardToDiscordUser(client, officialGuildId, newMember.id, POINTS_PER_BOOST, "서버 부스트").catch((err) => console.error("[activityRewards] 부스트 지급 실패:", err));
    announceBoost(newMember).catch((err) => console.error("[activityRewards] 부스트 감사 메시지 실패:", err));
  }

  const gainedVerifiedTitle =
    !oldMember.roles.cache.has(VERIFIED_TITLE_ROLE_ID) && newMember.roles.cache.has(VERIFIED_TITLE_ROLE_ID);
  if (gainedVerifiedTitle) {
    awardToDiscordUser(client, officialGuildId, newMember.id, POINTS_PER_VERIFIED_TITLE, "인증완료").catch((err) =>
      console.error("[activityRewards] 인증완료 지급 실패:", err),
    );
  }
}

/** 음성 채널 체류 10분당 지급 포인트 — 채팅처럼 적극적인 활동이 아니라 낮게 유지하고, 하루 상한을 둔다 */
const POINTS_PER_VOICE_10MIN = 1;
const VOICE_DAILY_CAP = 30;

const voiceJoinedAt = new Map<string, number>();
const voiceDailyTotal = new Map<string, { day: string; points: number }>();

/** 음성 채널에서 나간 시점에 머문 시간을 계산해서 10분 단위로 지급한다(하루 상한 적용) */
async function awardVoiceTime(client: Client, guildId: string, userId: string, joinedAt: number) {
  const minutes = Math.floor((Date.now() - joinedAt) / 60_000);
  const chunks = Math.floor(minutes / 10);
  if (chunks <= 0) return;

  const today = todayKey();
  const record = voiceDailyTotal.get(userId);
  const soFar = record?.day === today ? record.points : 0;
  const points = Math.min(chunks * POINTS_PER_VOICE_10MIN, Math.max(0, VOICE_DAILY_CAP - soFar));
  if (points <= 0) return;

  voiceDailyTotal.set(userId, { day: today, points: soFar + points });
  await awardToDiscordUser(client, guildId, userId, points, `음성채널 체류(${minutes}분)`);
}

/** 음성 채널 입장/퇴장만 본다(채널 이동은 계속 체류 중인 걸로 취급) — 재시작 중이던 세션의
 * 체류 시간은 메모리에만 있어서 유실될 수 있지만, 봇 재시작은 드물고 포인트도 적어서 감수한다 */
function handleVoiceStateUpdate(client: Client, oldState: VoiceState, newState: VoiceState, officialGuildId: string) {
  const guildId = newState.guild?.id ?? oldState.guild?.id;
  if (guildId !== officialGuildId) return;
  if ((newState.member ?? oldState.member)?.user.bot) return;

  const userId = newState.id;
  if (!oldState.channelId && newState.channelId) {
    voiceJoinedAt.set(userId, Date.now());
    return;
  }
  if (oldState.channelId && !newState.channelId) {
    const joinedAt = voiceJoinedAt.get(userId);
    voiceJoinedAt.delete(userId);
    if (joinedAt) {
      awardVoiceTime(client, officialGuildId, userId, joinedAt).catch((err) =>
        console.error("[activityRewards] 음성채널 지급 실패:", err),
      );
    }
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
    await awardToDiscordUser(client, officialGuildId, member.id, POINTS_PER_TAG_HOUR, "서버 태그 착용").catch((err) =>
      console.error("[activityRewards] 서버 태그 지급 실패:", err),
    );
  }
}

/**
 * 디스코드 활동(채팅/서버 태그/부스트/음성채널 체류/공지 반응/초대)으로 포인트를 지급한다. 연동(DiscordLink)된 계정만
 * 대상이며, 공식 서버(officialGuildId) 밖의 활동은 무시한다.
 */
/** 공지 채널에 봇이 올린 메시지에 리액션을 달면 1회 지급 — 같은 메시지에 같은 유저가 또 받진
 * 못하게 DB 유니크 제약(ReactionRewardClaim)으로 막는다. 사람이 올린 일반 채팅은 대상이 아니다 */
const POINTS_PER_REACTION = 5;

async function handleReactionAdd(
  client: Client,
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  officialGuildId: string,
) {
  if (user.bot) return;
  if (reaction.message.guildId !== officialGuildId) return;

  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });
  const allowedChannelIds = new Set([settings?.announcementChannelId, settings?.subAnnouncementChannelId].filter(Boolean));
  if (!allowedChannelIds.has(reaction.message.channelId)) return;

  const message = reaction.message.partial ? await reaction.message.fetch().catch(() => null) : reaction.message;
  if (!message?.author?.bot) return;

  try {
    await prisma.reactionRewardClaim.create({ data: { messageId: message.id, discordUserId: user.id } });
  } catch {
    return; // 이미 이 메시지에서 받았음(유니크 제약 위반) — 조용히 무시
  }
  await awardToDiscordUser(client, officialGuildId, user.id, POINTS_PER_REACTION, `공지 반응(msg:${message.id})`).catch((err) =>
    console.error("[activityRewards] 공지 반응 지급 실패:", err),
  );
}

/** 디스코드 자체 초대 링크로 새 멤버가 들어오면 초대한 사람에게 지급 — 가입 시점 스냅샷과 비교해
 * 어떤 초대 코드가 쓰였는지 찾는다(vanity URL로 들어온 경우는 초대 코드가 없어서 대상 제외). */
const POINTS_PER_INVITE = 20;
const inviteUsesCache = new Map<string, number>();

async function cacheInvites(client: Client, officialGuildId: string) {
  const guild = await client.guilds.fetch(officialGuildId).catch(() => null);
  const invites = await guild?.invites.fetch().catch(() => null);
  if (!invites) return;
  for (const invite of invites.values()) inviteUsesCache.set(invite.code, invite.uses ?? 0);
}

async function handleGuildMemberAdd(client: Client, member: GuildMember, officialGuildId: string) {
  if (member.guild.id !== officialGuildId) return;
  if (member.user.bot) return;

  const invites = await member.guild.invites.fetch().catch(() => null);
  if (!invites) return;
  const usedInvite = invites.find((invite) => (invite.uses ?? 0) > (inviteUsesCache.get(invite.code) ?? 0));
  for (const invite of invites.values()) inviteUsesCache.set(invite.code, invite.uses ?? 0);

  if (!usedInvite?.inviter || usedInvite.inviter.bot || usedInvite.inviter.id === member.id) return;

  try {
    await prisma.discordInviteReward.create({
      data: { inviterDiscordUserId: usedInvite.inviter.id, invitedDiscordUserId: member.id },
    });
  } catch {
    return; // 이미 집계된 피초대자(유니크 제약 위반) — 조용히 무시
  }
  await awardToDiscordUser(client, officialGuildId, usedInvite.inviter.id, POINTS_PER_INVITE, `초대(${member.user.tag})`).catch((err) =>
    console.error("[activityRewards] 초대 지급 실패:", err),
  );
}

export function startActivityRewards(client: Client, officialGuildId: string) {
  client.on(Events.MessageCreate, (message) => handleMessageCreate(client, message, officialGuildId));
  client.on(Events.GuildMemberUpdate, (oldMember, newMember) => handleGuildMemberUpdate(client, oldMember, newMember, officialGuildId));
  client.on(Events.VoiceStateUpdate, (oldState, newState) => handleVoiceStateUpdate(client, oldState, newState, officialGuildId));
  client.on(Events.MessageReactionAdd, (reaction, user) => handleReactionAdd(client, reaction, user, officialGuildId));
  client.on(Events.GuildMemberAdd, (member) => handleGuildMemberAdd(client, member, officialGuildId));
  cacheInvites(client, officialGuildId).catch((err) => console.error("[activityRewards] 초대 캐시 초기화 실패:", err));

  setInterval(() => {
    checkServerTags(client, officialGuildId).catch((err) => console.error("[activityRewards] 서버 태그 점검 오류:", err));
  }, TAG_CHECK_INTERVAL_MS);
}
