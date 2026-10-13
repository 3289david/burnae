import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonStyle,
  MessageFlags,
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";
import { prisma } from "./prismaClient";
import { PteroClient } from "../lib/pterodactyl";
import { renewFreeServer, ServerRenewalError } from "../lib/serverRenewal";
import { postOrRefreshSurvey } from "../lib/discordBoards";
import { formatMb } from "../lib/formatSize";
import { startPhoneVerification, confirmPhoneVerification, PhoneVerificationError } from "../lib/phoneVerification";
import { updateNodeStatusBoard } from "./nodeStatusBoard";
import {
  panel,
  heading,
  text,
  subtext,
  divider,
  actionButton,
  linkButton,
  buttonRow,
} from "../lib/discordComponentsV2";
import crypto from "node:crypto";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://burnae.kr";

/**
 * 이 봇은 Burnae 공식 디스코드 서버 단 하나에서만 동작한다 (index.ts의 길드 검증 참고).
 * 고객뿐 아니라 서버 멤버라면 누구나 /요금제, /이벤트, /문의 같은 일반 명령어를 쓸 수 있고,
 * /연동 으로 계정을 연동한 사람만 /서버목록, /상태, /시작, /정지, /재시작, /내정보, /서버관리,
 * /포인트 를 쓸 수 있다.
 *
 * 모든 응답은 Discord Components V2(Container/Section/TextDisplay/Separator)로 만든다 —
 * 전통적인 embed는 더 이상 쓰지 않는다(discordComponentsV2.ts 참고).
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
    .setName("연동")
    .setDescription("Burnae 계정과 디스코드를 연동합니다."),
  new SlashCommandBuilder()
    .setName("휴대폰인증")
    .setDescription("무료 서버를 만들 때 필요한 휴대폰 인증을 진행합니다.")
    .addStringOption((opt) =>
      opt.setName("번호").setDescription("010으로 시작하는 11자리 번호").setRequired(true),
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
  new SlashCommandBuilder()
    .setName("내정보")
    .setDescription("내 Burnae 계정 정보(포인트/서버/AI크레딧)를 패널로 봅니다."),
  new SlashCommandBuilder()
    .setName("서버관리")
    .setDescription("내 서버를 버튼으로 바로 시작/정지/재시작할 수 있는 패널을 봅니다."),
  new SlashCommandBuilder()
    .setName("포인트")
    .setDescription("보유 포인트와 최근 주문 상태를 패널로 봅니다."),
  new SlashCommandBuilder()
    .setName("패널")
    .setDescription("[관리자] 이 채널에 유저 패널(내정보/서버관리/포인트 버튼) 임베드를 올립니다.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("노드상태패널")
    .setDescription("[관리자] 이 채널에 노드별 RAM/CPU/저장공간 점유율 현황판을 설치합니다 (5분마다 자동 갱신).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("알림받기패널")
    .setDescription("[관리자] 이 채널에 공지 알림 받기 버튼 패널을 설치합니다.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
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

/** V2 패널 응답을 보낼 때 항상 같은 플래그 조합을 쓰게 하는 작은 헬퍼 */
function v2Reply(container: ReturnType<typeof panel>, ephemeral = true) {
  return {
    components: [container],
    flags: ephemeral ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral : MessageFlags.IsComponentsV2,
  };
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
    case "연동":
      return handleLink(interaction);
    case "휴대폰인증":
      return handlePhoneVerification(interaction);
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
    case "내정보":
      return handleMyInfo(interaction);
    case "서버관리":
      return handleServerManagementPanel(interaction);
    case "포인트":
      return handlePointsPanel(interaction);
    case "패널":
      return handlePanelCommand(interaction);
    case "노드상태패널":
      return handleNodeStatusPanelCommand(interaction);
    case "알림받기패널":
      return handleNotificationPanelCommand(interaction);
  }
}

async function handleHelp(interaction: ChatInputCommandInteraction) {
  const container = panel()
    .addTextDisplayComponents(heading("🔥 Burnae 봇 사용법"))
    .addTextDisplayComponents(
      text(
        [
          "**누구나 쓸 수 있는 명령어**",
          "`/요금제` 현재 판매 중인 플랜 보기",
          "`/이벤트` 진행 중인 이벤트/쿠폰 보기",
          "`/문의 내용` 운영진에게 비공개로 문의하기",
        ].join("\n"),
      ),
    )
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(
      text(
        [
          "**서버가 있는 분들은 계정을 연동하면 더 쓸 수 있어요**",
          "**1.** `/연동` 입력 → burnae.kr 로그인 화면에서 \"Discord로 계속하기\"로 로그인",
          "**2.** `/내정보` `/서버관리` `/포인트` `/서버목록` `/상태` `/시작` `/정지` `/재시작` 사용 가능",
        ].join("\n"),
      ),
    )
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(subtext("서버가 예기치 않게 꺼지면 이 봇이 DM으로 알려드려요."));
  await interaction.reply(v2Reply(container));
}

async function handlePlans(interaction: ChatInputCommandInteraction) {
  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
  if (products.length === 0) {
    await interaction.reply({ components: [text("현재 판매 중인 요금제가 없어요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }

  const container = panel().addTextDisplayComponents(heading("💰 Burnae 요금제"));
  products.forEach((p, i) => {
    if (i > 0) container.addSeparatorComponents(divider());
    container.addTextDisplayComponents(
      text(
        `**${p.name}** — ${p.priceMonthlyKrw.toLocaleString()}원/월\nRAM ${formatMb(p.ramMb)} · 디스크 ${formatMb(p.diskMb)} · 백업 ${p.backupSlots}개`,
      ),
    );
  });
  container.addSeparatorComponents(divider());
  container.addTextDisplayComponents(subtext("burnae.kr 에서 바로 만들 수 있어요."));
  await interaction.reply(v2Reply(container, false));
}

async function handleEvents(interaction: ChatInputCommandInteraction) {
  const now = new Date();
  const events = await prisma.event.findMany({
    where: { active: true, startsAt: { lte: now }, endsAt: { gte: now } },
    orderBy: { startsAt: "desc" },
    include: { coupon: true },
  });
  if (events.length === 0) {
    await interaction.reply({ components: [text("지금 진행 중인 이벤트가 없어요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }

  const container = panel().addTextDisplayComponents(heading("🎉 진행 중인 이벤트"));
  events.forEach((e, i) => {
    if (i > 0) container.addSeparatorComponents(divider());
    const coupon = e.coupon ? `\n쿠폰 코드: \`${e.coupon.code}\`` : "";
    container.addTextDisplayComponents(text(`**${e.title}**\n${e.description}${coupon}`));
  });
  await interaction.reply(v2Reply(container, false));
}

async function handleSupport(interaction: ChatInputCommandInteraction) {
  const content = interaction.options.getString("내용", true);

  if (!interaction.inGuild() || !interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
    await interaction.reply({ components: [text("이 명령어는 서버 채널에서만 사용할 수 있어요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
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
    await interaction.reply({
      components: [text(`✅ 비공개 문의 채널을 만들었어요: ${thread}`)],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error("[bot] 문의 채널 생성 실패:", err);
    await interaction.reply({
      components: [text("비공개 채널 생성에 실패했어요. 운영진에게 직접 DM을 보내주세요.")],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
}

/**
 * Discord로 로그인하면 콜백(oauth/[provider]/callback)에서 DiscordLink를 바로 upsert해주므로
 * 계정 페이지를 들렀다 올 필요 없이 이 버튼 하나로 로그인+연동이 한 번에 끝난다.
 * 이미 Google/GitHub로 가입해둔 사람만 예외적으로 계정 페이지의 "디스코드 연동" 버튼
 * (oauth/discord/start?mode=link)이 필요하므로, 그 경로는 보조 안내로만 남겨둔다.
 */
function loginLinkContainer() {
  return panel()
    .addTextDisplayComponents(
      text("아래 버튼으로 Discord 로그인만 하면 바로 연동까지 끝나요 — 계정 페이지를 따로 들를 필요 없어요."),
    )
    .addActionRowComponents(buttonRow(linkButton("🔗 Discord로 로그인하고 연동하기", `${SITE_URL}/api/auth/oauth/discord/start`)))
    .addTextDisplayComponents(
      subtext("이미 Google/GitHub로 가입한 계정이 있다면, 로그인 후 \"계정\" 페이지에서도 연동할 수 있어요."),
    );
}

async function handleLink(interaction: PanelInteraction) {
  const existing = await findLinkedUser(interaction.user.id);
  if (existing) {
    await interaction.reply({
      components: [text(`✅ 이미 **${existing.name}** 계정으로 연동되어 있어요!`)],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.reply(v2Reply(loginLinkContainer()));
}

/** /휴대폰인증 — 웹 대시보드(계정 페이지)와 똑같은 OCTOMO 문자 발신 인증을 디스코드에서 진행한다 */
async function handlePhoneVerification(interaction: ChatInputCommandInteraction) {
  const user = await findLinkedUser(interaction.user.id);
  if (!user) {
    await interaction.reply(v2Reply(panel().addTextDisplayComponents(text("먼저 `/연동` 명령어로 계정을 연동해주세요."))));
    return;
  }

  const phoneNumber = interaction.options.getString("번호", true);
  await interaction.reply(await buildPhoneVerificationStartReply(user.id, phoneNumber));
}

/** /휴대폰인증 슬래시 명령어와 패널의 모달 제출 둘 다에서 쓰는 "인증 코드 발급" 응답 생성기 */
async function buildPhoneVerificationStartReply(userId: string, phoneNumber: string) {
  try {
    const { code, targetNumber, expiresInMinutes } = await startPhoneVerification(prisma, userId, phoneNumber);
    return v2Reply(
      panel()
        .addTextDisplayComponents(
          heading("휴대폰 인증"),
          text(`**${targetNumber}**로 아래 코드를 문자로 보내주세요. (문자 요금이 발생해요, ${expiresInMinutes}분 내에 보내야 해요)`),
          text(`\`\`\`${code}\`\`\``),
        )
        .addActionRowComponents(buttonRow(actionButton("phoneverify_confirm", "✅ 문자 보냈어요 - 확인하기", ButtonStyle.Success))),
    );
  } catch (err) {
    const message = err instanceof PhoneVerificationError ? err.message : "인증 요청에 실패했어요.";
    return v2Reply(panel().addTextDisplayComponents(text(message)));
  }
}

/** 유저 패널의 "📱 휴대폰 인증" 버튼 — 번호를 입력받는 모달을 띄운다 */
async function handlePhoneVerifyPanelButton(interaction: ButtonInteraction) {
  const user = await findLinkedUser(interaction.user.id);
  if (!user) {
    await interaction.reply({ components: [text("먼저 `/연동` 명령어로 계정을 연동해주세요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }
  if (user.verifiedPhoneNumber) {
    await interaction.reply({ components: [text("✅ 이미 휴대폰 인증이 완료된 계정이에요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }

  const phoneInput = new TextInputBuilder()
    .setCustomId("번호")
    .setLabel("휴대폰 번호 (010으로 시작하는 11자리)")
    .setStyle(TextInputStyle.Short)
    .setMinLength(10)
    .setMaxLength(11)
    .setPlaceholder("01012345678")
    .setRequired(true);
  const modal = new ModalBuilder()
    .setCustomId("phoneverify_modal")
    .setTitle("휴대폰 인증")
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(phoneInput));
  await interaction.showModal(modal);
}

/** 위 모달 제출 처리 — index.ts의 InteractionCreate에서 호출한다 */
export async function handleModalSubmit(interaction: ModalSubmitInteraction) {
  if (interaction.customId !== "phoneverify_modal") return;

  const user = await findLinkedUser(interaction.user.id);
  if (!user) {
    await interaction.reply({ components: [text("먼저 `/연동` 명령어로 계정을 연동해주세요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }

  const phoneNumber = interaction.fields.getTextInputValue("번호");
  await interaction.reply(await buildPhoneVerificationStartReply(user.id, phoneNumber));
}

/** /휴대폰인증의 "문자 보냈어요" 버튼 */
async function handlePhoneVerifyConfirmButton(interaction: ButtonInteraction) {
  const user = await findLinkedUser(interaction.user.id);
  if (!user) {
    await interaction.reply({ components: [text("먼저 `/연동` 명령어로 계정을 연동해주세요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }
  try {
    const verified = await confirmPhoneVerification(prisma, user.id);
    const message = verified
      ? "✅ 휴대폰 인증이 완료됐어요! 이제 무료 서버를 만들 수 있어요."
      : "아직 문자가 확인되지 않았어요. 보낸 뒤 몇 초 기다렸다가 다시 눌러주세요.";
    await interaction.reply({ components: [text(message)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  } catch (err) {
    const message = err instanceof PhoneVerificationError ? err.message : "확인 중 오류가 발생했어요.";
    await interaction.reply({ components: [text(message)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  }
}

/**
 * /패널의 유일한 진입 버튼. 연동 안 한 사람에게는 내정보/서버관리/포인트 버튼을 아예 안 보여주고
 * (디스코드는 같은 메시지를 사람마다 다르게 보여줄 수 없어서, 패널 자체엔 이 버튼 하나만 두고
 * 클릭했을 때 개인화된 ephemeral 응답으로 분기한다) 로그인 링크만 준다.
 * 이미 연동된 사람에게는 그제서야 세 기능 버튼이 담긴 개인 메뉴를 보여준다.
 */
async function handlePanelEntry(interaction: ButtonInteraction) {
  const existing = await findLinkedUser(interaction.user.id);
  if (!existing) {
    await interaction.reply(v2Reply(loginLinkContainer()));
    return;
  }

  const container = panel()
    .addTextDisplayComponents(text(`👋 **${existing.name}**님, 아래에서 확인할 기능을 골라주세요.`))
    .addActionRowComponents(
      buttonRow(
        actionButton("panel_open_myinfo", "👤 내 정보"),
        actionButton("panel_open_servers", "🛠️ 서버 관리"),
        actionButton("panel_open_points", "💰 포인트"),
      ),
    );
  await interaction.reply(v2Reply(container));
}

function statusEmoji(status: string) {
  if (status === "RUNNING") return "🟢";
  if (status === "STOPPED") return "🔴";
  if (status === "SUSPENDED") return "⛔";
  return "🟡";
}

async function handleListServers(interaction: ChatInputCommandInteraction) {
  const user = await findLinkedUser(interaction.user.id);
  if (!user) {
    await interaction.reply({
      components: [text("먼저 `/연동` 명령어로 계정을 연동해주세요.")],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  const servers = await myServers(user.id);
  if (servers.length === 0) {
    await interaction.reply({
      components: [text("아직 생성한 서버가 없어요.")],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  const container = panel().addTextDisplayComponents(heading("🔥 내 Burnae 서버"));
  const zone = process.env.SUBDOMAIN_ZONE ?? "krl.kr";
  servers.forEach((s, i) => {
    if (i > 0) container.addSeparatorComponents(divider());
    const addresses = s.subdomains.map((d) => `\`${d.subdomain}.${zone}\``).join(", ");
    container.addTextDisplayComponents(text(`**${s.name}** — ${statusEmoji(s.status)} ${s.status}\n${addresses || "주소 준비 중"}`));
  });
  await interaction.reply(v2Reply(container));
}

async function requireOwnedServer(interaction: ChatInputCommandInteraction) {
  const user = await findLinkedUser(interaction.user.id);
  if (!user) {
    await interaction.reply({
      components: [text("먼저 `/연동` 명령어로 계정을 연동해주세요.")],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return null;
  }
  const serverId = interaction.options.getString("서버", true);
  const server = await prisma.server.findFirst({
    where: { id: serverId, ownerId: user.id, deletedAt: null },
  });
  if (!server) {
    await interaction.reply({
      components: [text("해당 서버를 찾을 수 없어요.")],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return null;
  }
  return server;
}

async function handleStatus(interaction: ChatInputCommandInteraction) {
  const server = await requireOwnedServer(interaction);
  if (!server) return;

  if (!server.pterodactylIdentifier) {
    await interaction.reply({
      components: [text(`**${server.name}** — 아직 생성 중입니다.`)],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  const resources = await PteroClient.getServerResources(server.pterodactylIdentifier);
  const container = panel(resources.current_state === "running" ? 0x22c55e : 0xef4444)
    .addTextDisplayComponents(heading(`${server.name} 상태`))
    .addTextDisplayComponents(
      text(
        `**상태**  ${resources.current_state}\n**CPU**  ${resources.resources.cpu_absolute.toFixed(1)}%\n**RAM**  ${Math.round(resources.resources.memory_bytes / 1024 / 1024)}MB`,
      ),
    );
  await interaction.reply(v2Reply(container));
}

async function handlePower(
  interaction: ChatInputCommandInteraction,
  signal: "start" | "stop" | "restart",
  label: string,
) {
  const server = await requireOwnedServer(interaction);
  if (!server) return;
  if (!server.pterodactylIdentifier) {
    await interaction.reply({
      components: [text("아직 생성 중인 서버예요.")],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  await PteroClient.sendPowerAction(server.pterodactylIdentifier, signal);
  await interaction.reply({
    components: [text(`⚙️ **${server.name}** 서버를 ${label} 요청했어요.`)],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

async function handleRenewFree(interaction: ChatInputCommandInteraction) {
  const user = await findLinkedUser(interaction.user.id);
  if (!user) {
    await interaction.reply({
      components: [text("먼저 `/연동` 명령어로 계정을 연동해주세요.")],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }
  const serverId = interaction.options.getString("서버", true);

  try {
    const server = await renewFreeServer(prisma, serverId, user.id);
    await interaction.reply({
      components: [text(`✅ **${server.name}** 서버를 7일 연장했어요.`)],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  } catch (err) {
    const message = err instanceof ServerRenewalError ? err.message : "갱신에 실패했어요.";
    await interaction.reply({ components: [text(message)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  }
}

async function handleLinktree(interaction: ChatInputCommandInteraction) {
  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });
  const links = await prisma.linktreeLink.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });

  if (links.length === 0) {
    await interaction.reply({ components: [text("아직 등록된 링크가 없어요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }

  const container = panel().addTextDisplayComponents(heading(settings?.linktreeTitle ?? "🔗 Burnae 링크"));
  for (let i = 0; i < links.slice(0, 25).length; i += 5) {
    container.addActionRowComponents(
      buttonRow(...links.slice(i, i + 5).map((l) => linkButton(l.label.slice(0, 80), l.url, l.emoji ?? undefined))),
    );
  }
  await interaction.reply(v2Reply(container, false));
}

async function handleRules(interaction: ChatInputCommandInteraction) {
  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });
  if (!settings?.rulesContent) {
    await interaction.reply({ components: [text("아직 규칙이 등록되지 않았어요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }
  const container = panel().addTextDisplayComponents(heading(settings.rulesTitle)).addTextDisplayComponents(text(settings.rulesContent));
  await interaction.reply(v2Reply(container));
}

async function handlePointsLeaderboard(interaction: ChatInputCommandInteraction) {
  const top = await prisma.user.findMany({
    where: { promotionPoints: { gt: 0 } },
    orderBy: { promotionPoints: "desc" },
    take: 10,
    include: { discordLink: true },
  });

  if (top.length === 0) {
    await interaction.reply({ components: [text("아직 포인트를 모은 사람이 없어요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }

  const medal = ["🥇", "🥈", "🥉"];
  const container = panel()
    .addTextDisplayComponents(heading("🏆 홍보 포인트 랭킹"))
    .addTextDisplayComponents(
      text(
        top
          .map((u, i) => {
            const name = u.discordLink ? `<@${u.discordLink.discordUserId}>` : u.name;
            return `${medal[i] ?? `${i + 1}.`} ${name} — ${u.promotionPoints.toLocaleString()}점`;
          })
          .join("\n"),
      ),
    );
  await interaction.reply(v2Reply(container, false));
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

  await interaction.reply({
    components: [text("✅ 소중한 의견 감사해요! 운영진이 확인할게요.")],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

async function handleNotificationSettings(interaction: ChatInputCommandInteraction) {
  const container = panel()
    .addTextDisplayComponents(text("아래 버튼으로 공지 알림 역할을 켜거나 끌 수 있어요."))
    .addActionRowComponents(buttonRow(actionButton("toggle_subscriber", "🔔 공지 알림 켜기/끄기")));
  await interaction.reply(v2Reply(container));
}

/** /내정보, /서버관리, /포인트 둘 다 슬래시 명령으로 직접도 쓰고, /패널(관리자가 올리는 고정 임베드)의
 * 버튼을 클릭했을 때도 같은 로직으로 "클릭한 사람 기준"으로 보여준다 — 그래서 이 세 함수는
 * ChatInputCommandInteraction/ButtonInteraction 둘 다 받는다(둘 다 .user와 .reply()가 있음) */
type PanelInteraction = ChatInputCommandInteraction | ButtonInteraction;

/** /내정보 — 포인트/서버수/AI크레딧을 보여주는 계정 정보 패널 */
async function handleMyInfo(interaction: PanelInteraction) {
  const user = await findLinkedUser(interaction.user.id);
  if (!user) {
    await interaction.reply({
      components: [text("먼저 `/연동` 명령어로 계정을 연동해주세요.")],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  const servers = await myServers(user.id);
  const runningCount = servers.filter((s) => s.status === "RUNNING").length;

  const container = panel()
    .addTextDisplayComponents(heading(`👤 ${user.name}님의 Burnae 정보`))
    .addTextDisplayComponents(
      text(
        `**보유 포인트**  ${user.promotionPoints.toLocaleString()}P\n**AI 크레딧**  ${user.aiCreditsRemaining.toLocaleString()}개\n**서버**  ${servers.length}개 (가동 ${runningCount}개)`,
      ),
    )
    .addSeparatorComponents(divider())
    .addActionRowComponents(
      buttonRow(
        linkButton("대시보드 바로가기", `${SITE_URL}/dashboard`),
        linkButton("요금제 보기", `${SITE_URL}/#plans`),
      ),
    );
  await interaction.reply(v2Reply(container));
}

/** 서버 1개를 "이름+상태 한 줄 + 조작 버튼 로우"로 그린다 — /서버관리 패널과 버튼 처리에서 공용으로 쓴다 */
function addServerManagementBlock(
  container: ReturnType<typeof panel>,
  server: { id: string; name: string; status: string; priceMonthlyKrwSnapshot: number | null },
) {
  const isFree = (server.priceMonthlyKrwSnapshot ?? 0) === 0;
  container.addTextDisplayComponents(text(`**${server.name}** — ${statusEmoji(server.status)} ${server.status}`));
  const buttons = [
    actionButton(`panel_power_start_${server.id}`, "▶ 시작", ButtonStyle.Success),
    actionButton(`panel_power_stop_${server.id}`, "⏹ 정지", ButtonStyle.Danger),
    actionButton(`panel_power_restart_${server.id}`, "🔁 재시작", ButtonStyle.Secondary),
  ];
  if (isFree) buttons.push(actionButton(`panel_renew_${server.id}`, "⏳ 7일 연장", ButtonStyle.Primary));
  container.addActionRowComponents(buttonRow(...buttons));
}

const SERVER_MANAGEMENT_PANEL_LIMIT = 5;

/** /서버관리 — 서버마다 시작/정지/재시작(+무료면 연장) 버튼이 달린 패널. 서버가 많으면 앞 5개만 보여줌 */
async function handleServerManagementPanel(interaction: PanelInteraction) {
  const user = await findLinkedUser(interaction.user.id);
  if (!user) {
    await interaction.reply({
      components: [text("먼저 `/연동` 명령어로 계정을 연동해주세요.")],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  const servers = await myServers(user.id);
  if (servers.length === 0) {
    await interaction.reply({
      components: [text("아직 생성한 서버가 없어요.")],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  const container = panel().addTextDisplayComponents(heading("🛠️ 서버 관리"));
  const shown = servers.slice(0, SERVER_MANAGEMENT_PANEL_LIMIT);
  shown.forEach((s, i) => {
    if (i > 0) container.addSeparatorComponents(divider());
    addServerManagementBlock(container, s);
  });
  if (servers.length > SERVER_MANAGEMENT_PANEL_LIMIT) {
    container.addSeparatorComponents(divider());
    container.addTextDisplayComponents(subtext(`서버가 ${servers.length}개 있어요 — 나머지는 대시보드에서 관리해주세요.`));
  }
  await interaction.reply(v2Reply(container));
}

/** /포인트 — 보유 포인트 + 최근 주문 상태 패널 */
async function handlePointsPanel(interaction: PanelInteraction) {
  const user = await findLinkedUser(interaction.user.id);
  if (!user) {
    await interaction.reply({
      components: [text("먼저 `/연동` 명령어로 계정을 연동해주세요.")],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  const recentOrder = await prisma.order.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });

  const container = panel()
    .addTextDisplayComponents(heading("💰 내 포인트"))
    .addTextDisplayComponents(text(`**보유 포인트**  ${user.promotionPoints.toLocaleString()}P`));

  if (recentOrder) {
    container.addSeparatorComponents(divider());
    const statusLabel: Record<string, string> = {
      PENDING: "⏳ 입금 대기 중",
      PAID: "✅ 결제 완료",
      CANCELLED: "❌ 취소됨",
      EXPIRED: "⏰ 만료됨",
    };
    container.addTextDisplayComponents(
      text(
        `**최근 주문**  ${recentOrder.amountKrw.toLocaleString()}원 — ${statusLabel[recentOrder.status] ?? recentOrder.status}`,
      ),
    );
  }

  container.addSeparatorComponents(divider());
  container.addActionRowComponents(buttonRow(linkButton("포인트 충전 / 포인트샵", `${SITE_URL}/dashboard/promotions`)));
  await interaction.reply(v2Reply(container));
}

/**
 * /패널 — 관리자가 채널에 한 번 올려두는 고정 임베드. 유저 패널(내정보/서버관리/포인트)은 더 이상
 * 각자 슬래시 명령으로만 쓰는 게 아니라, 이 임베드에 달린 버튼을 누르면 누른 사람 기준으로
 * handleMyInfo 등이 그대로 실행된다(버튼 클릭도 interaction.user가 클릭한 사람이라 개인화됨).
 * 길드 관리 권한(Administrator/ManageGuild)이 있는 사람만 올릴 수 있다.
 */
async function handlePanelCommand(interaction: ChatInputCommandInteraction) {
  if (
    !interaction.inGuild() ||
    !(
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    )
  ) {
    await interaction.reply({
      components: [text("이 명령어는 서버 관리 권한이 있는 분만 사용할 수 있어요.")],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }
  if (!interaction.channel || !("send" in interaction.channel)) {
    await interaction.reply({ components: [text("이 채널에는 올릴 수 없어요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }

  const container = panel()
    .addTextDisplayComponents(heading("🔥 Burnae 유저 패널"))
    .addTextDisplayComponents(
      text(
        "아래 버튼을 눌러주세요 — 아직 연동 안 했으면 로그인 링크를 드리고, 이미 연동했으면 내 정보/서버 관리/포인트 메뉴가 바로 나와요.\n" +
          "무료 서버를 만들려면 휴대폰 인증도 필요해요 — 📱 버튼으로 여기서 바로 할 수 있어요.",
      ),
    )
    .addActionRowComponents(
      buttonRow(
        actionButton("panel_open_link", "🔗 내 계정 / 연동"),
        actionButton("panel_open_phoneverify", "📱 휴대폰 인증"),
      ),
    );

  await interaction.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
  await interaction.reply({
    components: [text("✅ 이 채널에 유저 패널을 올렸어요.")],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

/**
 * /노드상태패널 — 관리자 DM으로 3시간마다 보내던 노드 점유율 보고를 대체한다. 이 채널을
 * nodeStatusChannelId로 저장해두면 봇이 5분마다 같은 메시지를 고쳐가며 최신 점유율을 보여준다.
 */
async function handleNodeStatusPanelCommand(interaction: ChatInputCommandInteraction) {
  if (
    !interaction.inGuild() ||
    !(
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    )
  ) {
    await interaction.reply({
      components: [text("이 명령어는 서버 관리 권한이 있는 분만 사용할 수 있어요.")],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }
  if (!interaction.channel || !("send" in interaction.channel)) {
    await interaction.reply({ components: [text("이 채널에는 올릴 수 없어요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }

  await prisma.botSettings.upsert({
    where: { id: 1 },
    update: { nodeStatusChannelId: interaction.channel.id, nodeStatusMessageId: null },
    create: { id: 1, nodeStatusChannelId: interaction.channel.id },
  });
  await updateNodeStatusBoard(interaction.client);

  await interaction.reply({
    components: [text("✅ 이 채널에 노드 점유율 현황판을 설치했어요. 5분마다 자동으로 갱신돼요.")],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

/**
 * /알림받기패널 — 관리자가 채널에 한 번 올려두는 고정 패널. 버튼은 기존 /알림설정과 같은
 * toggle_subscriber를 그대로 쓴다(누른 사람 기준으로 역할이 켜지거나 꺼짐).
 */
async function handleNotificationPanelCommand(interaction: ChatInputCommandInteraction) {
  if (
    !interaction.inGuild() ||
    !(
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    )
  ) {
    await interaction.reply({
      components: [text("이 명령어는 서버 관리 권한이 있는 분만 사용할 수 있어요.")],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }
  if (!interaction.channel || !("send" in interaction.channel)) {
    await interaction.reply({ components: [text("이 채널에는 올릴 수 없어요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }

  const container = panel()
    .addTextDisplayComponents(heading("🔔 공지 알림 받기"))
    .addTextDisplayComponents(text("아래 버튼을 누르면 공지 알림 받기가 켜져요. 다시 누르면 꺼져요."))
    .addActionRowComponents(buttonRow(actionButton("toggle_subscriber", "🔔 공지 알림 켜기/끄기")));

  await interaction.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
  await interaction.reply({
    components: [text("✅ 이 채널에 알림받기 패널을 올렸어요.")],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

/** 규칙 인증 버튼 / 알림 구독 토글 버튼 / 서버관리 패널 버튼 — index.ts의 InteractionCreate에서 호출한다 */
export async function handleButton(interaction: ButtonInteraction) {
  if (interaction.customId === "verify_rules") return handleVerifyButton(interaction);
  if (interaction.customId.startsWith("verify_ans_")) return handleVerifyCaptchaAnswer(interaction);
  if (interaction.customId === "toggle_subscriber") return handleSubscriberToggle(interaction);
  if (interaction.customId.startsWith("survey_")) return handleSurveyVote(interaction);
  if (interaction.customId.startsWith("panel_power_")) return handlePanelPower(interaction);
  if (interaction.customId.startsWith("panel_renew_")) return handlePanelRenew(interaction);
  if (interaction.customId === "panel_open_link") return handlePanelEntry(interaction);
  if (interaction.customId === "panel_open_myinfo") return handleMyInfo(interaction);
  if (interaction.customId === "panel_open_servers") return handleServerManagementPanel(interaction);
  if (interaction.customId === "panel_open_points") return handlePointsPanel(interaction);
  if (interaction.customId === "phoneverify_confirm") return handlePhoneVerifyConfirmButton(interaction);
  if (interaction.customId === "panel_open_phoneverify") return handlePhoneVerifyPanelButton(interaction);
}

/** /서버관리 패널의 시작/정지/재시작 버튼 — customId: panel_power_<signal>_<serverId> */
async function handlePanelPower(interaction: ButtonInteraction) {
  const rest = interaction.customId.slice("panel_power_".length);
  const firstUnderscore = rest.indexOf("_");
  const signal = rest.slice(0, firstUnderscore) as "start" | "stop" | "restart";
  const serverId = rest.slice(firstUnderscore + 1);
  const label = { start: "시작", stop: "정지", restart: "재시작" }[signal] ?? signal;

  const user = await findLinkedUser(interaction.user.id);
  if (!user) {
    await interaction.reply({ components: [text("먼저 `/연동` 명령어로 계정을 연동해주세요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }
  const server = await prisma.server.findFirst({ where: { id: serverId, ownerId: user.id, deletedAt: null } });
  if (!server || !server.pterodactylIdentifier) {
    await interaction.reply({ components: [text("해당 서버를 찾을 수 없어요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }

  await PteroClient.sendPowerAction(server.pterodactylIdentifier, signal);
  await interaction.reply({
    components: [text(`⚙️ **${server.name}** 서버를 ${label} 요청했어요.`)],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

/** /서버관리 패널의 "7일 연장" 버튼 — customId: panel_renew_<serverId> */
async function handlePanelRenew(interaction: ButtonInteraction) {
  const serverId = interaction.customId.slice("panel_renew_".length);
  const user = await findLinkedUser(interaction.user.id);
  if (!user) {
    await interaction.reply({ components: [text("먼저 `/연동` 명령어로 계정을 연동해주세요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }
  try {
    const server = await renewFreeServer(prisma, serverId, user.id);
    await interaction.reply({
      components: [text(`✅ **${server.name}** 서버를 7일 연장했어요.`)],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  } catch (err) {
    const message = err instanceof ServerRenewalError ? err.message : "갱신에 실패했어요.";
    await interaction.reply({ components: [text(message)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  }
}

/** 설문 투표 버튼 — 관리자가 /admin/surveys에서 만든 투표에 아무나 답할 수 있다 (다시 누르면 표 변경) */
async function handleSurveyVote(interaction: ButtonInteraction) {
  const rest = interaction.customId.slice("survey_".length);
  const lastUnderscore = rest.lastIndexOf("_");
  const surveyId = rest.slice(0, lastUnderscore);
  const optionIndex = Number(rest.slice(lastUnderscore + 1));

  const survey = await prisma.survey.findUnique({ where: { id: surveyId } });
  if (!survey || !survey.active) {
    await interaction.reply({ components: [text("이 설문은 더 이상 진행하지 않아요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }

  await prisma.surveyVote.upsert({
    where: { surveyId_discordUserId: { surveyId, discordUserId: interaction.user.id } },
    update: { optionIndex },
    create: { surveyId, discordUserId: interaction.user.id, optionIndex },
  });

  await postOrRefreshSurvey(surveyId);
  await interaction.reply({
    components: [text(`✅ "${survey.options[optionIndex]}"에 투표했어요.`)],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
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
    await interaction.reply({ components: [text("아직 인증 역할이 설정되지 않았어요. 관리자에게 문의해주세요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.inGuild()) return;

  const member = await interaction.guild!.members.fetch(interaction.user.id);
  if (member.roles.cache.has(settings.verifiedRoleId)) {
    await interaction.reply({ components: [text("이미 인증되어 있어요!")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
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

  const container = panel()
    .addTextDisplayComponents(text(`🤖 사람인지 확인할게요! **${a} + ${b} = ?**`))
    .addActionRowComponents(
      buttonRow(...shuffled.map((v) => actionButton(`verify_ans_${challengeId}_${v}`, String(v)))),
    );
  await interaction.reply(v2Reply(container));
}

/** 규칙 인증 2단계: 캡챠 정답을 확인하고 맞으면 역할을 부여한다 */
async function handleVerifyCaptchaAnswer(interaction: ButtonInteraction) {
  const [, , challengeId, valueStr] = interaction.customId.split("_");
  const correct = verifyCaptchaAnswers.get(challengeId);
  verifyCaptchaAnswers.delete(challengeId); // 한 번 쓰면 만료 — 재사용/재전송 방지
  if (correct === undefined) {
    await interaction.update({ components: [text("⏰ 만료됐어요. 다시 인증 채널에서 인증 버튼을 눌러주세요.")], flags: MessageFlags.IsComponentsV2 });
    return;
  }
  if (Number(valueStr) !== correct) {
    await interaction.update({ components: [text("❌ 틀렸어요. 다시 인증 채널에서 인증 버튼을 눌러주세요.")], flags: MessageFlags.IsComponentsV2 });
    return;
  }

  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });
  if (!settings?.verifiedRoleId || !interaction.inGuild()) {
    await interaction.update({ components: [text("아직 인증 역할이 설정되지 않았어요. 관리자에게 문의해주세요.")], flags: MessageFlags.IsComponentsV2 });
    return;
  }

  try {
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    if (member.roles.cache.has(settings.verifiedRoleId)) {
      await interaction.update({ components: [text("이미 인증되어 있어요!")], flags: MessageFlags.IsComponentsV2 });
      return;
    }
    await member.roles.add(settings.verifiedRoleId);
    await interaction.update({ components: [text("✅ 인증이 완료됐어요. 환영합니다!")], flags: MessageFlags.IsComponentsV2 });
  } catch (err) {
    console.error("[bot] 인증 역할 부여 실패:", err);
    await interaction.update({ components: [text("역할 부여에 실패했어요. 관리자에게 문의해주세요.")], flags: MessageFlags.IsComponentsV2 });
  }
}

async function handleSubscriberToggle(interaction: ButtonInteraction) {
  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });
  if (!settings?.subscriberRoleId) {
    await interaction.reply({ components: [text("아직 알림 역할이 설정되지 않았어요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.inGuild()) return;

  try {
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    if (member.roles.cache.has(settings.subscriberRoleId)) {
      await member.roles.remove(settings.subscriberRoleId);
      await interaction.reply({ components: [text("🔕 공지 알림을 껐어요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    } else {
      await member.roles.add(settings.subscriberRoleId);
      await interaction.reply({ components: [text("🔔 공지 알림을 켰어요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }
  } catch (err) {
    console.error("[bot] 알림 역할 토글 실패:", err);
    await interaction.reply({ components: [text("처리에 실패했어요. 관리자에게 문의해주세요.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  }
}
