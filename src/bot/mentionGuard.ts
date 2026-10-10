import type { Client, Message } from "discord.js";
import { Events, PermissionFlagsBits } from "discord.js";

/**
 * 일반 멤버의 @everyone/@here 핑을 막는다. 두 겹으로 처리:
 * 1) 길드의 @everyone 기본 역할에서 MentionEveryone 권한을 꺼서, 그 권한을 따로 받은
 *    역할(관리자/모더레이터 등)이 아니면 애초에 핑이 울리지 않게 한다("아예 치지를 못하게").
 * 2) 그래도 메시지 자체(글자)는 전송될 수 있으므로, 권한이 없는 멤버가 보낸 @everyone/@here
 *    멘션은 보이는 즉시 삭제한다.
 */
export async function lockMentionEveryone(client: Client, officialGuildId: string) {
  const guild = await client.guilds.fetch(officialGuildId).catch(() => null);
  if (!guild) return;
  const everyoneRole = guild.roles.everyone;
  if (!everyoneRole.permissions.has(PermissionFlagsBits.MentionEveryone)) return;

  await everyoneRole
    .setPermissions(everyoneRole.permissions.remove(PermissionFlagsBits.MentionEveryone))
    .then(() => console.log("[mentionGuard] @everyone 역할의 멘션 권한을 꺼뒀어요."))
    .catch((err) => console.error("[mentionGuard] @everyone 역할 권한 수정 실패(봇에 역할 관리 권한이 있는지 확인):", err));
}

async function handleMessageCreate(message: Message, officialGuildId: string) {
  if (message.guildId !== officialGuildId) return;
  if (message.author.bot) return;
  if (!message.mentions.everyone) return;
  if (message.member?.permissions.has(PermissionFlagsBits.MentionEveryone)) return;

  try {
    await message.delete();
    await message.author
      .send("⚠️ 일반 멤버는 @everyone/@here 멘션을 쓸 수 없어서 메시지가 삭제됐어요.")
      .catch(() => {});
    console.log(`[mentionGuard] ${message.author.tag} 의 @everyone/@here 메시지 삭제`);
  } catch (err) {
    console.error("[mentionGuard] 메시지 삭제 실패:", err);
  }
}

export function startMentionGuard(client: Client, officialGuildId: string) {
  lockMentionEveryone(client, officialGuildId).catch((err) => console.error("[mentionGuard] 초기화 실패:", err));
  client.on(Events.MessageCreate, (message) => handleMessageCreate(message, officialGuildId));
}
