import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commandDefinitions } from "./commands";

/**
 * 슬래시 명령어를 디스코드에 등록한다. 봇 최초 배포 시, 그리고 명령어를 바꿀 때마다 1회 실행.
 * 실행: npm run bot:deploy-commands
 */
async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID; // 지정하면 해당 서버에만 즉시 반영(개발용), 없으면 전역 등록(전파 최대 1시간)

  if (!token || !clientId) {
    throw new Error("DISCORD_BOT_TOKEN / DISCORD_CLIENT_ID 환경변수가 필요합니다.");
  }

  const rest = new REST().setToken(token);
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  const result = await rest.put(route, { body: commandDefinitions });
  console.log(`✅ 슬래시 명령어 ${(result as unknown[]).length}개 등록 완료${guildId ? ` (길드: ${guildId})` : " (전역)"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
