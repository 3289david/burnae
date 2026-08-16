import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
  ChannelType,
} from "discord.js";
import { prisma } from "./prismaClient";
import { PteroClient } from "../lib/pterodactyl";

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
