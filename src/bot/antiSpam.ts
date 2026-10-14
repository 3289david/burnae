import { Client, Events, Message, PermissionFlagsBits } from "discord.js";

/**
 * 짧은 시간에 메시지를 쏟아내거나(도배) 같은 내용을 반복해서 보내는 걸 스팸으로 간주해
 * 메시지를 지우고 일정 시간 타임아웃시킨다. 메시지 삭제/관리 권한이 있는 멤버(운영진)는 제외.
 */
const SPAM_WINDOW_MS = 5_000;
const SPAM_MESSAGE_THRESHOLD = 5; // 5초 안에 5개 이상
const DUPLICATE_THRESHOLD = 3; // 같은 내용 3번 연속
const TIMEOUT_MS = 10 * 60_000;

interface UserActivity {
  timestamps: number[];
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
  const entry = activity.get(key) ?? { timestamps: [], lastContent: "", duplicateCount: 0 };

  entry.timestamps = entry.timestamps.filter((t) => now - t < SPAM_WINDOW_MS);
  entry.timestamps.push(now);

  if (message.content && message.content === entry.lastContent) {
    entry.duplicateCount += 1;
  } else {
    entry.duplicateCount = 1;
    entry.lastContent = message.content;
  }
  activity.set(key, entry);

  const isFlood = entry.timestamps.length >= SPAM_MESSAGE_THRESHOLD;
  const isDuplicateSpam = entry.duplicateCount >= DUPLICATE_THRESHOLD;
  if (!isFlood && !isDuplicateSpam) return;

  activity.delete(key);
  try {
    await message.delete().catch(() => {});
    if (message.member?.moderatable) {
      await message.member.timeout(TIMEOUT_MS, "스팸 감지(짧은 시간 내 메시지 폭주/반복 도배)");
    }
    await message.author.send(`⚠️ 스팸으로 감지돼서 ${TIMEOUT_MS / 60_000}분 동안 채팅이 제한됐어요.`).catch(() => {});
    console.log(`[antiSpam] ${message.author.tag} 스팸 감지 — 타임아웃 적용`);
  } catch (err) {
    console.error("[antiSpam] 처리 실패(봇에 메시지 관리/타임아웃 권한이 있는지 확인):", err);
  }
}

export function startAntiSpam(client: Client, officialGuildId: string) {
  client.on(Events.MessageCreate, (message) => handleMessage(message, officialGuildId));
}
