import "dotenv/config";
import { ActivityType, Client, GatewayIntentBits, Events, ChannelType } from "discord.js";
import { handleCommand, handleAutocomplete } from "./commands";
import { startCrashWatcher } from "./watcher";

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error("DISCORD_BOT_TOKEN 환경변수가 설정되지 않았습니다.");
  process.exit(1);
}

// 이 봇은 Burnae 하나가 소유하는 단일 봇이며, 여러 고객의 디스코드 서버(길드)에
// 동시에 설치되어 동작한다. 계정 연동은 discordUserId 기준으로 전역이라
// 어떤 길드에서 명령어를 쓰든 항상 본인 소유 서버만 조회/조작된다.
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`[bot] 로그인됨: ${c.user.tag} — 현재 ${c.guilds.cache.size}개 서버에 설치됨`);
  c.user.setActivity("/도움말", { type: ActivityType.Listening });
  startCrashWatcher(client);
});

client.on(Events.GuildCreate, async (guild) => {
  console.log(`[bot] 새 서버에 추가됨: ${guild.name} (${guild.id}) — 총 ${guild.client.guilds.cache.size}개`);
  const channel = guild.systemChannel;
  if (channel?.type === ChannelType.GuildText) {
    await channel
      .send("🔥 Burnae 봇이 추가됐어요! `/도움말` 을 입력하면 사용법을 볼 수 있어요.")
      .catch(() => {});
  }
});

client.on(Events.GuildDelete, (guild) => {
  console.log(`[bot] 서버에서 제거됨: ${guild.name} (${guild.id})`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
    } else if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction);
    }
  } catch (err) {
    console.error("[bot] 인터랙션 처리 오류:", err);
    if (interaction.isRepliable() && !interaction.replied) {
      await interaction.reply({ content: "처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.", ephemeral: true }).catch(() => {});
    }
  }
});

client.login(token);
