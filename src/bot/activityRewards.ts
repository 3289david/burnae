import type { Client, GuildMember, Message, PartialGuildMember } from "discord.js";
import { Events } from "discord.js";
import { prisma } from "./prismaClient";

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

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function awardToDiscordUser(discordUserId: string, points: number, reason: string) {
  const link = await prisma.discordLink.findUnique({ where: { discordUserId } });
  if (!link) {
    console.log(`[activityRewards] ${discordUserId} 미연동 계정이라 지급 안 함 (${reason})`);
    return;
  }
  await prisma.user.update({ where: { id: link.userId }, data: { promotionPoints: { increment: points } } });
  console.log(`[activityRewards] ${discordUserId} +${points}P (${reason})`);
}

function handleMessageCreate(message: Message, officialGuildId: string) {
  if (message.guildId !== officialGuildId) return;
  if (message.author.bot) return;

  const content = message.content.trim();
  if (content.length < MIN_MESSAGE_LENGTH) {
    // MessageContent 특권 인텐트가 디스코드 개발자 포털에서 꺼지면 content가 항상 빈 문자열로
    // 와서 모든 메시지가 조용히 여기서 걸린다 — 길이가 의심스럽게 0이면 바로 알 수 있게 남긴다
    if (content.length === 0) {
      console.log(`[activityRewards] ${message.author.id} 메시지 content가 비어있음 — MessageContent 인텐트 확인 필요`);
    }
    return;
  }

  const now = Date.now();
  const last = lastChatRewardAt.get(message.author.id) ?? 0;
  if (now - last < CHAT_REWARD_COOLDOWN_MS) {
    console.log(`[activityRewards] ${message.author.id} 쿨다운 중(${Math.ceil((CHAT_REWARD_COOLDOWN_MS - (now - last)) / 1000)}초 남음)`);
    return;
  }

  const today = todayKey();
  const record = chatDailyTotal.get(message.author.id);
  const soFar = record?.day === today ? record.points : 0;
  if (soFar >= CHAT_DAILY_CAP) {
    console.log(`[activityRewards] ${message.author.id} 오늘 일일 한도(${CHAT_DAILY_CAP}P) 도달`);
    return;
  }

  lastChatRewardAt.set(message.author.id, now);
  chatDailyTotal.set(message.author.id, { day: today, points: soFar + POINTS_PER_MESSAGE });

  awardToDiscordUser(message.author.id, POINTS_PER_MESSAGE, "채팅").catch((err) => console.error("[activityRewards] 채팅 지급 실패:", err));
}

function handleGuildMemberUpdate(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember, officialGuildId: string) {
  if (newMember.guild.id !== officialGuildId) return;

  const startedBoosting = !oldMember.premiumSince && newMember.premiumSince;
  if (startedBoosting) {
    awardToDiscordUser(newMember.id, POINTS_PER_BOOST, "서버 부스트").catch((err) => console.error("[activityRewards] 부스트 지급 실패:", err));
  }

  const gainedVerifiedTitle =
    !oldMember.roles.cache.has(VERIFIED_TITLE_ROLE_ID) && newMember.roles.cache.has(VERIFIED_TITLE_ROLE_ID);
  if (gainedVerifiedTitle) {
    awardToDiscordUser(newMember.id, POINTS_PER_VERIFIED_TITLE, "인증완료").catch((err) =>
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
