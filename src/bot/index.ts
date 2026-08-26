import "dotenv/config";
import { ActivityType, Client, GatewayIntentBits, Events } from "discord.js";
import { handleCommand, handleAutocomplete, handleButton } from "./commands";
import { startCrashWatcher } from "./watcher";
import { startStatusBoard } from "./statusBoard";
import { prisma } from "./prismaClient";

/**
 * 이 봇은 Burnae 공식 디스코드 서버(burnae.kr 커뮤니티) 딱 하나에서만 동작한다.
 * 고객이 자기 서버에 이 봇을 초대하는 구조가 아니다 — 일반 방문객도, 고객도
 * 전부 공식 서버에 들어와서 이 봇을 함께 쓴다. DISCORD_GUILD_ID로 그 서버를
 * 고정하고, 혹시 다른 길드에 잘못 추가되더라도 거기서는 응답하지 않는다.
 */
const token = process.env.DISCORD_BOT_TOKEN;
const officialGuildId = process.env.DISCORD_GUILD_ID;

if (!token) {
  console.error("DISCORD_BOT_TOKEN 환경변수가 설정되지 않았습니다.");
  process.exit(1);
}
if (!officialGuildId) {
  console.error("DISCORD_GUILD_ID 환경변수가 설정되지 않았습니다. Burnae 공식 서버 ID를 입력하세요.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once(Events.ClientReady, (c) => {
  console.log(`[bot] 로그인됨: ${c.user.tag} — 공식 서버: ${officialGuildId}`);
  c.user.setActivity("/도움말", { type: ActivityType.Listening });
  startCrashWatcher(client);
  startStatusBoard(client);
});

client.on(Events.GuildMemberAdd, async (member) => {
  if (member.guild.id !== officialGuildId) return;

  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } }).catch(() => null);
  const rulesHint = settings?.rulesChannelId ? ` <#${settings.rulesChannelId}> 에서 규칙 확인 후 인증도 해주세요.` : "";

  await member
    .send(
      `🔥 Burnae 공식 서버에 오신 걸 환영해요!\n\`/도움말\` 을 입력하면 사용법을 볼 수 있어요. \`/요금제\`로 플랜도 바로 확인해보세요.${rulesHint}`,
    )
    .catch(() => {
      // DM을 막아둔 유저면 조용히 무시
    });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.inGuild() && interaction.guildId !== officialGuildId) {
    if (interaction.isRepliable()) {
      await interaction
        .reply({ content: "이 봇은 Burnae 공식 디스코드 서버 전용이에요.", ephemeral: true })
        .catch(() => {});
    }
    return;
  }

  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
    } else if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    }
  } catch (err) {
    console.error("[bot] 인터랙션 처리 오류:", err);
    if (interaction.isRepliable() && !interaction.replied) {
      await interaction.reply({ content: "처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.", ephemeral: true }).catch(() => {});
    }
  }
});

client.login(token);
