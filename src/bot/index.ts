import "dotenv/config";
import { ActivityType, Client, GatewayIntentBits, Events, TextChannel, MessageFlags } from "discord.js";
import { handleCommand, handleAutocomplete, handleButton, handleModalSubmit } from "./commands";
import { startCrashWatcher } from "./watcher";
import { startStatusBoard } from "./statusBoard";
import { startNodeStatusBoard } from "./nodeStatusBoard";
import { startActivityRewards } from "./activityRewards";
import { startMentionGuard } from "./mentionGuard";
import { startAntiSpam } from "./antiSpam";
import { prisma } from "./prismaClient";
import { panel, text, subtext, thumbnail, section } from "../lib/discordComponentsV2";

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

// GuildMessages/MessageContent는 채팅 1자당 포인트 지급에 필요 — Discord 개발자 포털의
// Bot 설정에서 "MESSAGE CONTENT INTENT"를 켜둬야 실제로 메시지 내용을 받을 수 있다.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`[bot] 로그인됨: ${c.user.tag} — 공식 서버: ${officialGuildId}`);
  c.user.setActivity("/도움말", { type: ActivityType.Listening });
  startCrashWatcher();
  startStatusBoard(client);
  startNodeStatusBoard(client);
  startActivityRewards(client, officialGuildId);
  startMentionGuard(client, officialGuildId);
  startAntiSpam(client, officialGuildId);
});

client.on(Events.GuildMemberAdd, async (member) => {
  if (member.guild.id !== officialGuildId) return;

  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } }).catch(() => null);

  // 더 이상 "인증하기" 버튼을 눌러야 채널이 열리는 구조가 아니라, 들어오면 바로 전체 채널을
  // 볼 수 있게 인증 역할을 자동으로 준다. 이용약관 채널 안내만 환영 메시지에 남겨둔다.
  if (settings?.verifiedRoleId) {
    await member.roles.add(settings.verifiedRoleId).catch((err) => {
      console.error("[bot] 신규 멤버 인증 역할 자동 부여 실패:", err);
    });
  }
  const termsHint = settings?.rulesChannelId ? ` <#${settings.rulesChannelId}> 에서 이용약관도 확인해주세요.` : "";

  await member
    .send(
      `🔥 Burnae 공식 서버에 오신 걸 환영해요!\n\`/도움말\` 을 입력하면 사용법을 볼 수 있어요. \`/요금제\`로 플랜도 바로 확인해보세요.${termsHint}`,
    )
    .catch(() => {
      // DM을 막아둔 유저면 조용히 무시
    });

  // DM 환영 메시지와는 별개로, 설정해둔 채널에 공개 환영 메시지를 올린다 — 다른 멤버들이
  // 새로 온 사람을 알아보고 반겨줄 수 있게. 계정 생성일을 같이 보여줘서 스태프가 갓 만든
  // 계정(어뷰징/스팸 봇 가능성)인지 바로 구분할 수 있게 한다.
  if (settings?.welcomeChannelId) {
    try {
      const channel = await member.guild.channels.fetch(settings.welcomeChannelId);
      if (channel instanceof TextChannel) {
        const memberCount = member.guild.memberCount;
        const accountAgeDays = Math.floor((Date.now() - member.user.createdTimestamp) / (24 * 60 * 60 * 1000));
        const container = panel()
          .addSectionComponents(
            section(
              [
                `**${member.user.tag}** 님이 들어왔어요! (${memberCount.toLocaleString()}번째 멤버)`,
                accountAgeDays < 3 ? `⚠️ 계정 생성 ${accountAgeDays}일 전 — 새 계정이에요` : `계정 생성 ${accountAgeDays}일 전`,
              ],
              thumbnail(member.user.displayAvatarURL({ size: 128 })),
            ),
          )
          .addTextDisplayComponents(subtext("환영 인사 한마디 남겨주세요 🙌"));
        await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }
    } catch (err) {
      console.error("[bot] 공개 환영 메시지 발송 실패:", err);
    }
  }

  await logMemberChange(member.guild, settings?.logChannelId, "join", member.user.tag, member.user.id, member.guild.memberCount);
});

client.on(Events.GuildMemberRemove, async (member) => {
  if (member.guild.id !== officialGuildId) return;
  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } }).catch(() => null);
  await logMemberChange(member.guild, settings?.logChannelId, "leave", member.user.tag, member.user.id, member.guild.memberCount);
});

/** 관리자 로그 채널에 멤버 입장/퇴장을 남긴다 — 서버 생성/삭제 기록과 같은 채널에 모아둬서
 * 운영진이 한 곳에서 전체 흐름을 볼 수 있게 한다 */
async function logMemberChange(
  guild: { channels: { fetch: (id: string) => Promise<unknown> } },
  logChannelId: string | null | undefined,
  kind: "join" | "leave",
  userTag: string,
  userId: string,
  memberCount: number,
) {
  if (!logChannelId) return;
  try {
    const channel = await guild.channels.fetch(logChannelId);
    if (!(channel instanceof TextChannel)) return;
    const label = kind === "join" ? "🟢 입장" : "🔴 퇴장";
    const color = kind === "join" ? 0x22c55e : 0xef4444;
    const container = panel(color).addTextDisplayComponents(
      text(`${label}  **${userTag}** (${userId}) — 현재 ${memberCount.toLocaleString()}명`),
    );
    await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
  } catch (err) {
    console.error("[bot] 멤버 입/퇴장 로그 실패:", err);
  }
}

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
    } else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
    }
  } catch (err) {
    console.error("[bot] 인터랙션 처리 오류:", err);
    if (interaction.isRepliable() && !interaction.replied) {
      await interaction.reply({ content: "처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.", ephemeral: true }).catch(() => {});
    }
  }
});

client.login(token);
