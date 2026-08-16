import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "./prismaClient";
import { PteroClient } from "../lib/pterodactyl";

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName("도움말")
    .setDescription("Burnae 봇 사용법을 안내합니다."),
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
        "이 봇은 어느 디스코드 서버에 초대하든 똑같이 동작해요. 먼저 계정을 연동하세요.",
        "",
        "**1.** burnae.kr 대시보드 → 계정 → 디스코드 연동 → 코드 발급",
        "**2.** `/link 코드` 입력",
        "**3.** 이제 아래 명령어를 쓸 수 있어요",
        "",
        "`/서버목록` 내 서버 전체 보기",
        "`/상태 서버` 실시간 상태 확인",
        "`/시작 서버` `/정지 서버` `/재시작 서버` 전원 제어",
        "",
        "서버가 예기치 않게 꺼지면 이 봇이 DM으로 알려드려요.",
      ].join("\n"),
    );
  await interaction.reply({ embeds: [embed], ephemeral: true });
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
