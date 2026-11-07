import { Client, Events, Message, PermissionFlagsBits } from "discord.js";

/**
 * 짧은 시간에 메시지를 쏟아내거나(도배) 같은 내용을 반복해서 보내는 걸 스팸으로 간주해
 * 메시지를 지우고 일정 시간 타임아웃시킨다. 메시지 삭제/관리 권한이 있는 멤버(운영진)는 제외.
 *
 * 두 단계로 잡는다 — 짧은 폭주(5초 내 5개)만 보면 그보다 살짝 느린 속도로 "계속" 도배하는
 * 건 못 잡아서, 더 긴 창(60초 내 15개)도 따로 둔다. 둘 다 걸리면 "방금 보낸 것만"이 아니라
 * 그 창 안의 메시지를 전부 모아서 한 번에 지운다(bulkDelete) — 도배 흔적이 안 남게.
 */
const SPAM_WINDOW_MS = 5_000;
const SPAM_MESSAGE_THRESHOLD = 5; // 5초 안에 5개 이상
const SUSTAINED_WINDOW_MS = 60_000;
const SUSTAINED_MESSAGE_THRESHOLD = 15; // 60초 안에 15개 이상 — 느리게 계속하는 도배
const DUPLICATE_THRESHOLD = 3; // 같은 내용 3번 연속(채널 구분 없이, 유저 기준)
const TIMEOUT_MS = 10 * 60_000;

interface TrackedMessage {
  id: string;
  channelId: string;
  time: number;
}
interface UserActivity {
  messages: TrackedMessage[];
  lastContent: string;
  duplicateCount: number;
}
const activity = new Map<string, UserActivity>();

async function handleMessage(message: Message, officialGuildId: string) {
  if (message.guildId !== officialGuildId) return;
  if (message.author.bot) return;
  if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;

  const now = Date.now();
  const key = message.author.id;
  const entry = activity.get(key) ?? { messages: [], lastContent: "", duplicateCount: 0 };

  entry.messages = entry.messages.filter((m) => now - m.time < SUSTAINED_WINDOW_MS);
  entry.messages.push({ id: message.id, channelId: message.channelId, time: now });

  if (message.content && message.content === entry.lastContent) {
    entry.duplicateCount += 1;
  } else {
    entry.duplicateCount = 1;
    entry.lastContent = message.content;
  }
  activity.set(key, entry);

  const recentBurst = entry.messages.filter((m) => now - m.time < SPAM_WINDOW_MS);
  const isFlood = recentBurst.length >= SPAM_MESSAGE_THRESHOLD;
  const isSustained = entry.messages.length >= SUSTAINED_MESSAGE_THRESHOLD;
  const isDuplicateSpam = entry.duplicateCount >= DUPLICATE_THRESHOLD;
  if (!isFlood && !isSustained && !isDuplicateSpam) return;

  const toDelete = entry.messages;
  activity.delete(key);

  try {
    // 채널별로 모아서 bulkDelete — 걸린 메시지가 여러 채널에 걸쳐 있을 수 있어서(유저 기준
    // 추적이라) 채널마다 따로 묶어 지운다. bulkDelete는 14일 이내 메시지만 되는데, 이 범위는
    // 최대 60초 전 메시지들뿐이라 항상 조건을 만족한다.
    const byChannel = new Map<string, string[]>();
    for (const m of toDelete) {
      if (!byChannel.has(m.channelId)) byChannel.set(m.channelId, []);
      byChannel.get(m.channelId)!.push(m.id);
    }
    for (const [channelId, ids] of byChannel) {
      const channel = await message.guild?.channels.fetch(channelId).catch(() => null);
      if (channel?.isTextBased() && "bulkDelete" in channel) {
        await (channel as { bulkDelete: (ids: string[]) => Promise<unknown> }).bulkDelete(ids).catch(() => {});
      }
    }
    if (message.member?.moderatable) {
      const reason = isSustained ? "스팸 감지(지속적인 도배)" : isDuplicateSpam ? "스팸 감지(동일 메시지 반복)" : "스팸 감지(짧은 시간 내 메시지 폭주)";
      await message.member.timeout(TIMEOUT_MS, reason);
    }
    await message.author.send(`⚠️ 스팸으로 감지돼서 ${TIMEOUT_MS / 60_000}분 동안 채팅이 제한됐어요.`).catch(() => {});
    console.log(`[antiSpam] ${message.author.tag} 스팸 감지 — 메시지 ${toDelete.length}개 삭제, 타임아웃 적용`);
  } catch (err) {
    console.error("[antiSpam] 처리 실패(봇에 메시지 관리/타임아웃 권한이 있는지 확인):", err);
  }
}

export function startAntiSpam(client: Client, officialGuildId: string) {
  client.on(Events.MessageCreate, (message) => handleMessage(message, officialGuildId));
}
