import {
  ButtonInteraction,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  OverwriteResolvable,
} from "discord.js";
import { prisma } from "./prismaClient";
import { TICKET_CATEGORIES, TicketCategoryKey } from "../lib/discordBoards";
import { panel, heading, text, actionButton, buttonRow, ButtonStyle } from "../lib/discordComponentsV2";

/**
 * 🎫 티켓 패널(discordBoards.ts의 syncTicketPanelMessage가 그리는 메시지) 버튼 클릭을 처리한다.
 * 패널 자체는 REST만으로 그릴 수 있지만, 채널 생성/권한 설정은 게이트웨이 클라이언트가 있는
 * 이 봇 프로세스에서만 할 수 있어서 여기 둔다.
 *
 * 한 사람당 열린 티켓은 하나만 — 같은 카테고리든 다른 카테고리든 상관없이, 이미 열려 있으면
 * 새로 만들지 않고 기존 채널로 안내한다(중복 생성으로 카테고리가 금방 지저분해지는 걸 막기 위함).
 */
function isTicketStaff(interaction: ButtonInteraction): boolean {
  const supportRoleId = process.env.DISCORD_SUPPORT_ROLE_ID;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  if (supportRoleId && interaction.member && "roles" in interaction.member) {
    const roles = interaction.member.roles;
    if (typeof roles !== "string" && "cache" in roles && roles.cache.has(supportRoleId)) return true;
  }
  return false;
}

export async function handleTicketButton(interaction: ButtonInteraction) {
  if (interaction.customId.startsWith("ticket_open:")) return handleTicketOpen(interaction);
  if (interaction.customId.startsWith("ticket_close:")) return handleTicketClose(interaction);
  if (interaction.customId.startsWith("ticket_delete:")) return handleTicketDelete(interaction);
  if (interaction.customId.startsWith("ticket_claim:")) return handleTicketClaim(interaction, true);
  if (interaction.customId.startsWith("ticket_unclaim:")) return handleTicketClaim(interaction, false);
}

/**
 * TicketTool 스타일 "관리 패널" — 담당자 지정/해제 + 닫기를 한 메시지에 모아둔다. 운영진만
 * 눌러서 실제로 효과가 나게 하고(isTicketStaff), 티켓을 연 사람도 같은 채널에 있으니 메시지
 * 자체는 보이지만(디스코드는 같은 채널 안에서 유저별로 메시지를 숨길 수 없음) 버튼은 운영진이
 * 아니면 눌러도 거부된다.
 */
function buildAdminPanel(ticket: { id: string; claimedByDiscordId: string | null }) {
  const container = panel(0x60a5fa)
    .addTextDisplayComponents(heading("🎛️ 관리 패널"))
    .addTextDisplayComponents(
      text(ticket.claimedByDiscordId ? `담당자: <@${ticket.claimedByDiscordId}>` : "담당자: 미지정"),
    );
  container.addActionRowComponents(
    buttonRow(
      ticket.claimedByDiscordId
        ? actionButton(`ticket_unclaim:${ticket.id}`, "🙋 담당 해제", ButtonStyle.Secondary)
        : actionButton(`ticket_claim:${ticket.id}`, "🙋 담당자 지정하기", ButtonStyle.Secondary),
      actionButton(`ticket_close:${ticket.id}`, "🔒 티켓 닫기", ButtonStyle.Danger),
    ),
  );
  return container;
}

async function handleTicketClaim(interaction: ButtonInteraction, claim: boolean) {
  const ticketId = interaction.customId.slice(claim ? "ticket_claim:".length : "ticket_unclaim:".length);
  if (!isTicketStaff(interaction)) {
    await interaction.reply({ components: [text("운영진만 담당자를 지정/해제할 수 있어요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.status === "CLOSED") {
    await interaction.reply({ components: [text("이미 닫힌 티켓이에요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }
  const updated = await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: { claimedByDiscordId: claim ? interaction.user.id : null },
  });
  await interaction.update({ components: [buildAdminPanel(updated)], flags: MessageFlags.IsComponentsV2 });
}

async function handleTicketOpen(interaction: ButtonInteraction) {
  const key = interaction.customId.slice("ticket_open:".length) as TicketCategoryKey;
  const category = TICKET_CATEGORIES.find((c) => c.key === key);
  if (!category || !interaction.guild) {
    await interaction.reply({ components: [text("알 수 없는 티켓 종류예요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }

  const existing = await prisma.supportTicket.findFirst({
    where: { openedByDiscordId: interaction.user.id, status: "OPEN" },
  });
  if (existing) {
    await interaction.reply({
      components: [text(`이미 열려 있는 티켓이 있어요: <#${existing.guildChannelId}>`)],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });
  const supportRoleId = process.env.DISCORD_SUPPORT_ROLE_ID;

  const overwrites: OverwriteResolvable[] = [
    { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: interaction.user.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
    },
  ];
  if (supportRoleId) {
    overwrites.push({
      id: supportRoleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
    });
  }

  try {
    const channel = await interaction.guild.channels.create({
      name: `${category.key.toLowerCase()}-${interaction.user.username}`.slice(0, 90),
      type: ChannelType.GuildText,
      parent: settings?.ticketCategoryId ?? undefined,
      topic: `${category.title} — ${interaction.user.tag}`,
      permissionOverwrites: overwrites,
      reason: `${interaction.user.tag}님의 ${category.title} 티켓`,
    });

    const ticket = await prisma.supportTicket.create({
      data: { guildChannelId: channel.id, openedByDiscordId: interaction.user.id, category: category.key },
    });

    // Components V2 메시지는 content를 전혀 못 쓴다(같이 보내면 Discord가 바로 거부함 — 채널은
    // 이미 만들어진 뒤라 이 send()만 실패하면서 "생성 실패"로 잘못 보였던 버그) — 역할 멘션은
    // 그래서 content가 아니라 컨테이너 안 텍스트에 넣는다(멘션은 그래도 울린다).
    const intro = panel()
      .addTextDisplayComponents(heading(`${category.emoji} ${category.title}`))
      .addTextDisplayComponents(
        text(
          `${supportRoleId ? `<@&${supportRoleId}>\n` : ""}${category.description}\n\n열어주신 분: <@${interaction.user.id}>\n편하게 자세히 적어주시면 운영진이 확인 후 답변드려요.`,
        ),
      );
    await channel.send({ components: [intro], flags: MessageFlags.IsComponentsV2 });
    await channel.send({ components: [buildAdminPanel(ticket)], flags: MessageFlags.IsComponentsV2 });

    await interaction.editReply({
      components: [text(`✅ 티켓이 생성됐어요: ${channel}`)],
      flags: MessageFlags.IsComponentsV2,
    });
  } catch (err) {
    console.error("[tickets] 티켓 채널 생성 실패:", err);
    await interaction.editReply({
      components: [text("티켓 채널 생성에 실패했어요. 관리자가 티켓 카테고리 설정을 확인해야 할 수도 있어요.")],
      flags: MessageFlags.IsComponentsV2,
    });
  }
}

async function handleTicketClose(interaction: ButtonInteraction) {
  const ticketId = interaction.customId.slice("ticket_close:".length);
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.status === "CLOSED") {
    await interaction.reply({ components: [text("이미 닫힌 티켓이에요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }
  if (ticket.openedByDiscordId !== interaction.user.id && !isTicketStaff(interaction)) {
    await interaction.reply({ components: [text("티켓을 연 본인이거나 운영진만 닫을 수 있어요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }

  await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: { status: "CLOSED", closedAt: new Date(), closedByDiscordId: interaction.user.id },
  });

  try {
    const channel = interaction.channel;
    if (channel && "permissionOverwrites" in channel) {
      await channel.permissionOverwrites.edit(ticket.openedByDiscordId, { SendMessages: false }).catch(() => {});
      if (!channel.name.startsWith("closed-")) {
        await channel.setName(`closed-${channel.name}`.slice(0, 90)).catch(() => {});
      }
    }
  } catch (err) {
    console.error("[tickets] 티켓 채널 잠금 실패:", err);
  }

  const container = panel()
    .addTextDisplayComponents(heading("🔒 티켓이 닫혔어요"))
    .addTextDisplayComponents(text(`처리: <@${interaction.user.id}>\n더 이상 메시지를 보낼 수 없어요. 필요하면 운영진이 이 채널을 완전히 삭제할 수 있어요.`));
  container.addActionRowComponents(buttonRow(actionButton(`ticket_delete:${ticket.id}`, "🗑 영구 삭제", ButtonStyle.Danger)));

  await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function handleTicketDelete(interaction: ButtonInteraction) {
  const ticketId = interaction.customId.slice("ticket_delete:".length);
  if (!isTicketStaff(interaction)) {
    await interaction.reply({ components: [text("운영진만 티켓을 삭제할 수 있어요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }

  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  await interaction.reply({ components: [text("🗑 3초 뒤 이 채널을 삭제할게요.")], flags: MessageFlags.IsComponentsV2 });
  setTimeout(() => {
    if (interaction.channel && "delete" in interaction.channel) {
      interaction.channel.delete(`${interaction.user.tag}님이 티켓 삭제`).catch((err) => {
        console.error("[tickets] 티켓 채널 삭제 실패:", err);
      });
    }
  }, 3000);
  void ticket;
}
