import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commandDefinitions } from "./commands";

/**
 * 슬래시 명령어를 Burnae 공식 서버(DISCORD_GUILD_ID) 하나에만 등록한다.
 * 봇이 공식 서버 전용이라 항상 길드 단위로 등록 — 전역 등록과 달리 즉시 반영된다.
 * 실행: npm run bot:deploy-commands (최초 배포 시, 명령어를 바꿀 때마다 재실행)
 */
async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token || !clientId || !guildId) {
    throw new Error(
      "DISCORD_BOT_TOKEN / DISCORD_CLIENT_ID / DISCORD_GUILD_ID 환경변수가 모두 필요합니다.",
    );
  }

  const rest = new REST().setToken(token);
  const result = await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: commandDefinitions,
  });
  console.log(`✅ 슬래시 명령어 ${(result as unknown[]).length}개를 공식 서버(${guildId})에 등록 완료`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
