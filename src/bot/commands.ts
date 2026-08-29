import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ButtonInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} from "discord.js";
import { prisma } from "./prismaClient";
import { PteroClient } from "../lib/pterodactyl";
import { renewFreeServer, ServerRenewalError } from "../lib/serverRenewal";
import { postOrRefreshSurvey } from "../lib/discordBoards";
import crypto from "node:crypto";

/**
 * 이 봇은 Burnae 공식 디스코드 서버 단 하나에서만 동작한다 (index.ts의 길드 검증 참고).
 * 고객뿐 아니라 서버 멤버라면 누구나 /요금제, /이벤트, /문의 같은 일반 명령어를 쓸 수 있고,
 * /link 로 계정을 연동한 사람만 /서버목록, /상태, /시작, /정지, /재시작 을 쓸 수 있다.
 */
export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName("도움말")
    .setDescription("Burnae 봇 사용법을 안내합니다."),
  new SlashCommandBuilder()
    .setName("요금제")
    .setDescription("현재 판매 중인 호스팅 요금제를 봅니다."),
  new SlashCommandBuilder()
    .setName("이벤트")
    .setDescription("진행 중인 이벤트/쿠폰을 봅니다."),
  new SlashCommandBuilder()
    .setName("문의")
    .setDescription("운영진에게 1:1로 문의합니다 (비공개 채널 생성).")
    .addStringOption((opt) =>
      opt.setName("내용").setDescription("문의 내용을 간단히 적어주세요").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Burnae 계정과 디스코드를 연동합니다.")
    .addStringOption((opt) =>
      opt.setName("코드").setDescription("Burnae 대시보드에서 발급받은 6자리 코드").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("서버목록")
    .setDescription("내 Burnae 서버 목록을 봅니다."),
  new SlashCommandBuilder()
    .setName("상태")
    .setDescription("서버 상태를 확인합니다.")
    .addStringOption((opt) =>
      opt.setName("서버").setDescription("서버 이름").setRequired(true).setAutocomplete(true),
    ),
  new SlashCommandBuilder()
    .setName("시작")
    .setDescription("서버를 시작합니다.")
    .addStringOption((opt) =>
      opt.setName("서버").setDescription("서버 이름").setRequired(true).setAutocomplete(true),
    ),
  new SlashCommandBuilder()
    .setName("정지")
    .setDescription("서버를 정지합니다.")
    .addStringOption((opt) =>
      opt.setName("서버").setDescription("서버 이름").setRequired(true).setAutocomplete(true),
    ),
  new SlashCommandBuilder()
    .setName("재시작")
    .setDescription("서버를 재시작합니다.")
    .addStringOption((opt) =>
      opt.setName("서버").setDescription("서버 이름").setRequired(true).setAutocomplete(true),
    ),
  new SlashCommandBuilder()
    .setName("갱신")
    .setDescription("무료 서버를 7일 연장합니다.")
    .addStringOption((opt) =>
      opt.setName("서버").setDescription("서버 이름").setRequired(true).setAutocomplete(true),
    ),
  new SlashCommandBuilder()
    .setName("링크트리")
    .setDescription("Burnae 관련 링크 모음을 봅니다."),
  new SlashCommandBuilder()
    .setName("규칙")
    .setDescription("서버 규칙을 봅니다."),
  new SlashCommandBuilder()
    .setName("포인트순위")
    .setDescription("홍보 포인트 랭킹을 봅니다."),
  new SlashCommandBuilder()
    .setName("설문")
    .setDescription("운영진에게 자유롭게 의견/제안을 보냅니다.")
    .addStringOption((opt) =>
      opt.setName("내용").setDescription("의견이나 제안을 적어주세요").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("알림설정")
    .setDescription("공지 알림 받기를 켜거나 끕니다."),
].map((c) => c.toJSON());

async function findLinkedUser(discordUserId: string) {
  const link = await prisma.discordLink.findUnique({
    where: { discordUserId },
    include: { user: true },
  });
  return link?.user ?? null;
}

async function myServers(userId: string) {
  return prisma.server.findMany({
    where: { ownerId: userId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { subdomains: { orderBy: { isPrimary: "desc" } } },
  });
}

export async function handleAutocomplete(interaction: AutocompleteInteraction) {
  const user = await findLinkedUser(interaction.user.id);
  if (!user) return interaction.respond([]);

  const focused = interaction.options.getFocused().toLowerCase();
  const servers = await myServers(user.id);
  const options = servers
    .filter((s) => s.name.toLowerCase().includes(focused))
    .slice(0, 25)
    .map((s) => ({ name: s.name, value: s.id }));
  await interaction.respond(options);
}

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  switch (interaction.commandName) {
    case "도움말":
      return handleHelp(interaction);
    case "요금제":
      return handlePlans(interaction);
    case "이벤트":
      return handleEvents(interaction);
    case "문의":
      return handleSupport(interaction);
    case "link":
      return handleLink(interaction);
    case "서버목록":
      return handleListServers(interaction);
    case "상태":
      return handleStatus(interaction);
    case "시작":
      return handlePower(interaction, "start", "시작");
    case "정지":
      return handlePower(interaction, "stop", "정지");
    case "재시작":
      return handlePower(interaction, "restart", "재시작");
    case "갱신":
      return handleRenewFree(interaction);
    case "링크트리":
      return handleLinktree(interaction);
    case "규칙":
      return handleRules(interaction);
    case "포인트순위":
      return handlePointsLeaderboard(interaction);
    case "설문":
      return handleSurvey(interaction);
    case "알림설정":
      return handleNotificationSettings(interaction);
  }
}

async function handleHelp(interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle("🔥 Burnae 봇 사용법")
    .setColor(0xff6b35)
    .setDescription(
      [
        "**누구나 쓸 수 있는 명령어**",
        "`/요금제` 현재 판매 중인 플랜 보기",
        "`/이벤트` 진행 중인 이벤트/쿠폰 보기",
        "`/문의 내용` 운영진에게 비공개로 문의하기",
        "",
        "**서버가 있는 분들은 계정을 연동하면 더 쓸 수 있어요**",
        "**1.** burnae.kr 대시보드 → 계정 → 디스코드 연동 → 코드 발급",
        "**2.** 여기서 `/link 코드` 입력",
        "**3.** `/서버목록` `/상태` `/시작` `/정지` `/재시작` 사용 가능",
        "",
        "서버가 예기치 않게 꺼지면 이 봇이 DM으로 알려드려요.",
      ].join("\n"),
    );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handlePlans(interaction: ChatInputCommandInteraction) {
  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
  if (products.length === 0) {
    await interaction.reply({ content: "현재 판매 중인 요금제가 없어요.", ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("💰 Burnae 요금제")
    .setColor(0xff6b35)
    .setDescription(
      products
        .map(
          (p) =>
            `**${p.name}** — ${p.priceMonthlyKrw.toLocaleString()}원/월\nRAM ${(p.ramMb / 1024).toFixed(0)}GB · 디스크 ${(p.diskMb / 1024).toFixed(0)}GB · 백업 ${p.backupSlots}개`,
        )
        .join("\n\n"),
    )
    .setFooter({ text: "burnae.kr 에서 바로 만들 수 있어요." });
  await interaction.reply({ embeds: [embed] });
}

async function handleEvents(interaction: ChatInputCommandInteraction) {
  const now = new Date();
  const events = await prisma.event.findMany({
    where: { active: true, startsAt: { lte: now }, endsAt: { gte: now } },
    orderBy: { startsAt: "desc" },
    include: { coupon: true },
  });
  if (events.length === 0) {
    await interaction.reply({ content: "지금 진행 중인 이벤트가 없어요.", ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🎉 진행 중인 이벤트")
    .setColor(0xff6b35)
    .setDescription(
      events
        .map((e) => {
          const coupon = e.coupon
            ? `\n쿠폰 코드: \`${e.coupon.code}\``
            : "";
          return `**${e.title}**\n${e.description}${coupon}`;
        })
        .join("\n\n"),
    );
  await interaction.reply({ embeds: [embed] });
}

async function handleSupport(interaction: ChatInputCommandInteraction) {
  const content = interaction.options.getString("내용", true);

  if (!interaction.inGuild() || !interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: "이 명령어는 서버 채널에서만 사용할 수 있어요.", ephemeral: true });
    return;
  }

  const supportRoleId = process.env.DISCORD_SUPPORT_ROLE_ID;

  try {
    const thread = await interaction.channel.threads.create({
      name: `문의-${interaction.user.username}`.slice(0, 90),
      type: ChannelType.PrivateThread,
      reason: `${interaction.user.tag}님의 문의`,
    });
    await thread.members.add(interaction.user.id);
    await thread.send(
      `${supportRoleId ? `<@&${supportRoleId}> ` : ""}📩 **${interaction.user.tag}** 님의 문의\n> ${content}`,
    );
    await interaction.reply({ content: `✅ 비공개 문의 채널을 만들었어요: ${thread}`, ephemeral: true });
  } catch (err) {
    console.error("[bot] 문의 채널 생성 실패:", err);
    await interaction.reply({
      content: "비공개 채널 생성에 실패했어요. 운영진에게 직접 DM을 보내주세요.",
      ephemeral: true,
    });
  }
}

async function handleLink(interaction: ChatInputCommandInteraction) {
  const code = interaction.options.getString("코드", true).toUpperCase();
  const record = await prisma.discordLinkCode.findUnique({ where: { code } });

  if (!record || record.expiresAt < new Date()) {
    await interaction.reply({ content: "코드가 올바르지 않거나 만료되었습니다. 대시보드에서 새로 발급받아주세요.", ephemeral: true });
    return;
  }

  await prisma.$transaction([
    prisma.discordLink.create({ data: { userId: record.userId, discordUserId: interaction.user.id } }),
    prisma.discordLinkCode.delete({ where: { id: record.id } }),
  ]);

  // 공식 서버 안에서 "고객" 역할을 자동으로 부여 (설정된 경우)
  const customerRoleId = process.env.DISCORD_CUSTOMER_ROLE_ID;
  if (customerRoleId && interaction.inGuild()) {
    try {
      const member = await interaction.guild!.members.fetch(interaction.user.id);
      await member.roles.add(customerRoleId);
    } catch (err) {
      console.error("[bot] 고객 역할 부여 실패:", err);
    }
  }

  await interaction.reply({ content: "✅ Burnae 계정이 연동되었습니다! 이제 `/서버목록`으로 내 서버를 확인할 수 있어요.", ephemeral: true });
}

async function handleListServers(interaction: ChatInputCommandInteraction) {
  const user = await findLinkedUser(interaction.user.id);
  if (!user) {
    await interaction.reply({ content: "먼저 `/link` 명령어로 계정을 연동해주세요.", ephemeral: true });
    return;
  }

  const servers = await myServers(user.id);
  if (servers.length === 0) {
    await interaction.reply({ content: "아직 생성한 서버가 없어요.", ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🔥 내 Burnae 서버")
    .setColor(0xff6b35)
    .setDescription(
      servers
        .map((s) => {
          const zone = process.env.SUBDOMAIN_ZONE ?? "krl.kr";
          const addresses = s.subdomains.map((d) => `\`${d.subdomain}.${zone}\``).join(", ");
          return `**${s.name}** — ${statusEmoji(s.status)} ${s.status}\n${addresses || "주소 준비 중"}`;
        })
        .join("\n\n"),
    );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

function statusEmoji(status: string) {
  if (status === "RUNNING") return "🟢";
  if (status === "STOPPED") return "🔴";
  if (status === "SUSPENDED") return "⛔";
  return "🟡";
}

async function requireOwnedServer(interaction: ChatInputCommandInteraction) {
  const user = await findLinkedUser(interaction.user.id);
  if (!user) {
    await interaction.reply({ content: "먼저 `/link` 명령어로 계정을 연동해주세요.", ephemeral: true });
    return null;
  }
  const serverId = interaction.options.getString("서버", true);
  const server = await prisma.server.findFirst({
    where: { id: serverId, ownerId: user.id, deletedAt: null },
  });
  if (!server) {
    await interaction.reply({ content: "해당 서버를 찾을 수 없어요.", ephemeral: true });
    return null;
  }
  return server;
}

async function handleStatus(interaction: ChatInputCommandInteraction) {
  const server = await requireOwnedServer(interaction);
  if (!server) return;

  if (!server.pterodactylIdentifier) {
    await interaction.reply({ content: `**${server.name}** — 아직 생성 중입니다.`, ephemeral: true });
    return;
  }

  const resources = await PteroClient.getServerResources(server.pterodactylIdentifier);
  const embed = new EmbedBuilder()
    .setTitle(`${server.name} 상태`)
    .setColor(resources.current_state === "running" ? 0x22c55e : 0xef4444)
    .addFields(
      { name: "상태", value: resources.current_state, inline: true },
      { name: "CPU", value: `${resources.resources.cpu_absolute.toFixed(1)}%`, inline: true },
      { name: "RAM", value: `${Math.round(resources.resources.memory_bytes / 1024 / 1024)}MB`, inline: true },
    );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handlePower(
  interaction: ChatInputCommandInteraction,
  signal: "start" | "stop" | "restart",
  label: string,
) {
  const server = await requireOwnedServer(interaction);
  if (!server) return;
  if (!server.pterodactylIdentifier) {
    await interaction.reply({ content: "아직 생성 중인 서버예요.", ephemeral: true });
    return;
  }

  await PteroClient.sendPowerAction(server.pterodactylIdentifier, signal);
  await interaction.reply({ content: `⚙️ **${server.name}** 서버를 ${label} 요청했어요.`, ephemeral: true });
}

async function handleRenewFree(interaction: ChatInputCommandInteraction) {
  const user = await findLinkedUser(interaction.user.id);
  if (!user) {
    await interaction.reply({ content: "먼저 `/link` 명령어로 계정을 연동해주세요.", ephemeral: true });
    return;
  }
  const serverId = interaction.options.getString("서버", true);

  try {
    const server = await renewFreeServer(prisma, serverId, user.id);
    await interaction.reply({ content: `✅ **${server.name}** 서버를 7일 연장했어요.`, ephemeral: true });
  } catch (err) {
    const message = err instanceof ServerRenewalError ? err.message : "갱신에 실패했어요.";
    await interaction.reply({ content: message, ephemeral: true });
  }
}

async function handleLinktree(interaction: ChatInputCommandInteraction) {
  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });
  const links = await prisma.linktreeLink.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });

  if (links.length === 0) {
    await interaction.reply({ content: "아직 등록된 링크가 없어요.", ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder().setTitle(settings?.linktreeTitle ?? "🔗 Burnae 링크").setColor(0xff6b35);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < links.length; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const link of links.slice(i, i + 5)) {
      const button = new ButtonBuilder().setLabel(link.label.slice(0, 80)).setStyle(ButtonStyle.Link).setURL(link.url);
      if (link.emoji) button.setEmoji(link.emoji);
      row.addComponents(button);
    }
    rows.push(row);
  }
  await interaction.reply({ embeds: [embed], components: rows.slice(0, 5) });
}

async function handleRules(interaction: ChatInputCommandInteraction) {
  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });
  if (!settings?.rulesContent) {
    await interaction.reply({ content: "아직 규칙이 등록되지 않았어요.", ephemeral: true });
    return;
  }
  const embed = new EmbedBuilder()
    .setTitle(settings.rulesTitle)
    .setDescription(settings.rulesContent)
    .setColor(0xff6b35);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handlePointsLeaderboard(interaction: ChatInputCommandInteraction) {
  const top = await prisma.user.findMany({
    where: { promotionPoints: { gt: 0 } },
    orderBy: { promotionPoints: "desc" },
    take: 10,
    include: { discordLink: true },
  });

  if (top.length === 0) {
    await interaction.reply({ content: "아직 포인트를 모은 사람이 없어요.", ephemeral: true });
    return;
  }

  const medal = ["🥇", "🥈", "🥉"];
  const embed = new EmbedBuilder()
    .setTitle("🏆 홍보 포인트 랭킹")
    .setColor(0xff6b35)
    .setDescription(
      top
        .map((u, i) => {
          const name = u.discordLink ? `<@${u.discordLink.discordUserId}>` : u.name;
          return `${medal[i] ?? `${i + 1}.`} ${name} — ${u.promotionPoints.toLocaleString()}점`;
        })
        .join("\n"),
    );
  await interaction.reply({ embeds: [embed] });
}

async function handleSurvey(interaction: ChatInputCommandInteraction) {
  const content = interaction.options.getString("내용", true);
  const user = await findLinkedUser(interaction.user.id);

  await prisma.surveyResponse.create({
    data: {
      discordUserId: interaction.user.id,
      discordTag: interaction.user.tag,
      userId: user?.id,
      content,
    },
  });

  await interaction.reply({ content: "✅ 소중한 의견 감사해요! 운영진이 확인할게요.", ephemeral: true });
}

async function handleNotificationSettings(interaction: ChatInputCommandInteraction) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("toggle_subscriber").setLabel("🔔 공지 알림 켜기/끄기").setStyle(ButtonStyle.Secondary),
  );
  await interaction.reply({
    content: "아래 버튼으로 공지 알림 역할을 켜거나 끌 수 있어요.",
    components: [row],
    ephemeral: true,
  });
}

/** 규칙 인증 버튼 / 알림 구독 토글 버튼 — index.ts의 InteractionCreate에서 호출한다 */
export async function handleButton(interaction: ButtonInteraction) {
  if (interaction.customId === "verify_rules") return handleVerifyButton(interaction);
  if (interaction.customId.startsWith("verify_ans_")) return handleVerifyCaptchaAnswer(interaction);
  if (interaction.customId === "toggle_subscriber") return handleSubscriberToggle(interaction);
  if (interaction.customId.startsWith("survey_")) return handleSurveyVote(interaction);
}

/** 설문 투표 버튼 — 관리자가 /admin/surveys에서 만든 투표에 아무나 답할 수 있다 (다시 누르면 표 변경) */
async function handleSurveyVote(interaction: ButtonInteraction) {
  const rest = interaction.customId.slice("survey_".length);
  const lastUnderscore = rest.lastIndexOf("_");
  const surveyId = rest.slice(0, lastUnderscore);
  const optionIndex = Number(rest.slice(lastUnderscore + 1));

  const survey = await prisma.survey.findUnique({ where: { id: surveyId } });
  if (!survey || !survey.active) {
    await interaction.reply({ content: "이 설문은 더 이상 진행하지 않아요.", ephemeral: true });
    return;
  }

  await prisma.surveyVote.upsert({
    where: { surveyId_discordUserId: { surveyId, discordUserId: interaction.user.id } },
    update: { optionIndex },
    create: { surveyId, discordUserId: interaction.user.id, optionIndex },
  });

  await postOrRefreshSurvey(surveyId);
  await interaction.reply({ content: `✅ "${survey.options[optionIndex]}"에 투표했어요.`, ephemeral: true });
}

/** 규칙 인증 1단계: 역할을 바로 주지 않고 간단한 계산 캡챠를 먼저 보여준다(단순 자동클릭봇 방지) */
// customId는 클라이언트(디스코드 앱/게이트웨이 메시지)에 그대로 노출되므로 정답을 여기 담으면
// 안 된다 — 랜덤 challenge id로 서버(봇 프로세스) 메모리에만 정답을 들고 있는다. 방치된 챌린지가
// 계속 쌓이지 않게 일정 시간 뒤 자동으로 지운다
const verifyCaptchaAnswers = new Map<string, number>();
const VERIFY_CAPTCHA_TTL_MS = 2 * 60 * 1000;

async function handleVerifyButton(interaction: ButtonInteraction) {
  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });
  if (!settings?.verifiedRoleId) {
    await interaction.reply({ content: "아직 인증 역할이 설정되지 않았어요. 관리자에게 문의해주세요.", ephemeral: true });
    return;
  }
  if (!interaction.inGuild()) return;

  const member = await interaction.guild!.members.fetch(interaction.user.id);
  if (member.roles.cache.has(settings.verifiedRoleId)) {
    await interaction.reply({ content: "이미 인증되어 있어요!", ephemeral: true });
    return;
  }

  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  const correct = a + b;
  const options = new Set<number>([correct]);
  while (options.size < 4) {
    options.add(Math.max(2, correct + Math.floor(Math.random() * 11) - 5));
  }
  const shuffled = [...options].sort(() => Math.random() - 0.5);

  const challengeId = crypto.randomUUID();
  verifyCaptchaAnswers.set(challengeId, correct);
  setTimeout(() => verifyCaptchaAnswers.delete(challengeId), VERIFY_CAPTCHA_TTL_MS);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    shuffled.map((v) =>
      new ButtonBuilder().setCustomId(`verify_ans_${challengeId}_${v}`).setLabel(String(v)).setStyle(ButtonStyle.Secondary),
    ),
  );
  await interaction.reply({
    content: `🤖 사람인지 확인할게요! **${a} + ${b} = ?**`,
    components: [row],
    ephemeral: true,
  });
}

/** 규칙 인증 2단계: 캡챠 정답을 확인하고 맞으면 역할을 부여한다 */
async function handleVerifyCaptchaAnswer(interaction: ButtonInteraction) {
  const [, , challengeId, valueStr] = interaction.customId.split("_");
  const correct = verifyCaptchaAnswers.get(challengeId);
  verifyCaptchaAnswers.delete(challengeId); // 한 번 쓰면 만료 — 재사용/재전송 방지
  if (correct === undefined) {
    await interaction.update({ content: "⏰ 만료됐어요. 다시 인증 채널에서 인증 버튼을 눌러주세요.", components: [] });
    return;
  }
  if (Number(valueStr) !== correct) {
    await interaction.update({ content: "❌ 틀렸어요. 다시 인증 채널에서 인증 버튼을 눌러주세요.", components: [] });
    return;
  }

  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });
  if (!settings?.verifiedRoleId || !interaction.inGuild()) {
    await interaction.update({ content: "아직 인증 역할이 설정되지 않았어요. 관리자에게 문의해주세요.", components: [] });
    return;
  }

  try {
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    if (member.roles.cache.has(settings.verifiedRoleId)) {
      await interaction.update({ content: "이미 인증되어 있어요!", components: [] });
      return;
    }
    await member.roles.add(settings.verifiedRoleId);
    await interaction.update({ content: "✅ 인증이 완료됐어요. 환영합니다!", components: [] });
  } catch (err) {
    console.error("[bot] 인증 역할 부여 실패:", err);
    await interaction.update({ content: "역할 부여에 실패했어요. 관리자에게 문의해주세요.", components: [] });
  }
}

async function handleSubscriberToggle(interaction: ButtonInteraction) {
  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });
  if (!settings?.subscriberRoleId) {
    await interaction.reply({ content: "아직 알림 역할이 설정되지 않았어요.", ephemeral: true });
    return;
  }
  if (!interaction.inGuild()) return;

  try {
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    if (member.roles.cache.has(settings.subscriberRoleId)) {
      await member.roles.remove(settings.subscriberRoleId);
      await interaction.reply({ content: "🔕 공지 알림을 껐어요.", ephemeral: true });
    } else {
      await member.roles.add(settings.subscriberRoleId);
      await interaction.reply({ content: "🔔 공지 알림을 켰어요.", ephemeral: true });
    }
  } catch (err) {
    console.error("[bot] 알림 역할 토글 실패:", err);
    await interaction.reply({ content: "처리에 실패했어요. 관리자에게 문의해주세요.", ephemeral: true });
  }
}
