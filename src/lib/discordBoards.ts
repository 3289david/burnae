import { prisma } from "@/lib/prisma";
import { upsertDiscordChannelMessage } from "@/lib/discordNotify";
import {
  panel,
  heading,
  text,
  subtext,
  divider,
  actionButton,
  buttonRow,
  linkButton,
  section,
  ButtonStyle,
  COMPONENTS_V2_FLAG,
} from "@/lib/discordComponentsV2";

/**
 * 티켓 카테고리 4종 — 패널 버튼과 봇 쪽 인터랙션 핸들러(src/bot/tickets.ts)가 이 목록을 공유한다.
 * 봇 프로세스에서도 그대로 쓰므로 여기(discordBoards.ts, 게이트웨이 의존성 없음)에 둔다.
 */
export const TICKET_CATEGORIES = [
  { key: "SERVER", emoji: "📌", title: "서버 문의", description: "서버 이용, 역할/채널 오류, 이벤트 등 일반 서버 문의 전용 양식" },
  { key: "REPORT", emoji: "🚨", title: "신고 문의", description: "규칙 위반 유저 신고 및 증거 캡처 제출 전용 비공개 티켓 양식" },
  { key: "AD", emoji: "📢", title: "광고 문의", description: "서버 제휴 및 상호 홍보 검토를 위한 전용 양식" },
  { key: "PAYMENT", emoji: "💳", title: "결제 문의", description: "후원 및 유료 멤버십 결제 내역 확인 전용 보안 상담 양식" },
] as const;

export type TicketCategoryKey = (typeof TICKET_CATEGORIES)[number]["key"];

/**
 * 이용약관/규칙 패널을 "관리자가 설정을 저장할 때마다" 다시 그려서 올린다. 새로 만들지 않고
 * 저장된 메시지 id가 있으면 그 메시지를 그대로 수정한다(핀 고정이 풀리지 않고, 채널이
 * 도배되지 않는다).
 *
 * 전에는 이 패널에 "✅ 인증하기" 버튼이 있어서 눌러야 서버 전체 채널이 보였다 — 이제는 가입하면
 * 바로 전체 채널이 보이게 바뀌어서(src/bot/index.ts의 GuildMemberAdd에서 자동으로 역할을 준다)
 * 이 패널은 순수 안내용(이용약관 + 링크)으로만 남는다. verify_rules 버튼 핸들러 자체는
 * 하위호환으로 코드에 남겨뒀지만(기존에 안 눌렀던 극소수가 나중에 눌러도 에러 없이
 * "이미 인증되어 있어요"가 뜨게) 더 이상 이 메시지에는 버튼을 붙이지 않는다.
 */
export async function syncRulesMessage(): Promise<void> {
  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });
  if (!settings?.rulesChannelId) return;

  const container = panel()
    .addTextDisplayComponents(heading(settings.rulesTitle))
    .addTextDisplayComponents(text(settings.rulesContent || "아직 이용약관이 등록되지 않았어요."));

  const messageId = await upsertDiscordChannelMessage(settings.rulesChannelId, settings.rulesMessageId, {
    components: [container.toJSON()],
    flags: COMPONENTS_V2_FLAG,
  });

  if (messageId && messageId !== settings.rulesMessageId) {
    await prisma.botSettings.update({ where: { id: 1 }, data: { rulesMessageId: messageId } });
  }
}

export async function syncLinktreeMessage(): Promise<void> {
  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });
  if (!settings?.linktreeChannelId) return;

  const links = await prisma.linktreeLink.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });

  const container = panel().addTextDisplayComponents(heading(settings.linktreeTitle));
  if (links.length === 0) {
    container.addTextDisplayComponents(text("아직 등록된 링크가 없어요."));
  } else {
    // 디스코드 메시지 하나당 액션로우 최대 5개, 로우 하나당 버튼 최대 5개 = 최대 25개
    for (let i = 0; i < links.slice(0, 25).length; i += 5) {
      const row = buttonRow(
        ...links.slice(i, i + 5).map((l) => linkButton(l.label.slice(0, 80), l.url, l.emoji ?? undefined)),
      );
      container.addActionRowComponents(row);
    }
  }

  const messageId = await upsertDiscordChannelMessage(settings.linktreeChannelId, settings.linktreeMessageId, {
    components: [container.toJSON()],
    flags: COMPONENTS_V2_FLAG,
  });

  if (messageId && messageId !== settings.linktreeMessageId) {
    await prisma.botSettings.update({ where: { id: 1 }, data: { linktreeMessageId: messageId } });
  }
}

/**
 * 4개 카테고리 중 하나를 골라 여는 티켓 패널. 버튼 자체(각 섹션의 "열기" 버튼)는 눌렀을 때
 * src/bot/tickets.ts의 handleTicketButton이 처리한다(채널 생성은 게이트웨이 클라이언트가 필요해서
 * REST만 쓰는 이 파일에서는 할 수 없다) — 여기서는 패널 "표시"만 담당한다.
 */
export async function syncTicketPanelMessage(): Promise<void> {
  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });
  if (!settings?.ticketPanelChannelId) return;

  const container = panel().addTextDisplayComponents(heading("🎫 문의하기"), subtext("아래에서 문의 종류를 골라주세요 — 운영진만 볼 수 있는 비공개 채널이 만들어져요."));
  container.addSeparatorComponents(divider());
  TICKET_CATEGORIES.forEach((cat, i) => {
    if (i > 0) container.addSeparatorComponents(divider());
    container.addSectionComponents(
      section(`${cat.emoji} **${cat.title}**\n${cat.description}`, actionButton(`ticket_open:${cat.key}`, "열기", ButtonStyle.Secondary, cat.emoji)),
    );
  });

  const messageId = await upsertDiscordChannelMessage(settings.ticketPanelChannelId, settings.ticketPanelMessageId, {
    components: [container.toJSON()],
    flags: COMPONENTS_V2_FLAG,
  });

  if (messageId && messageId !== settings.ticketPanelMessageId) {
    await prisma.botSettings.update({ where: { id: 1 }, data: { ticketPanelMessageId: messageId } });
  }
}

/**
 * 설문(투표) 패널을 그려서 올리거나(처음) 기존 메시지를 최신 투표수로 갱신한다.
 * 관리자가 설문을 만들 때, 그리고 봇이 투표 버튼 클릭을 처리한 직후 둘 다 호출한다.
 */
export async function postOrRefreshSurvey(surveyId: string): Promise<void> {
  const survey = await prisma.survey.findUnique({ where: { id: surveyId } });
  if (!survey) return;

  const votes = await prisma.surveyVote.findMany({ where: { surveyId } });
  const total = votes.length;
  const counts = survey.options.map((_, i) => votes.filter((v) => v.optionIndex === i).length);

  const container = panel().addTextDisplayComponents(heading(`📊 ${survey.question}`));

  survey.options.forEach((opt, i) => {
    const count = counts[i];
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const barLength = 12;
    const filled = total > 0 ? Math.round((count / total) * barLength) : 0;
    const bar = "█".repeat(filled) + "░".repeat(barLength - filled);
    container.addTextDisplayComponents(text(`**${opt}**\n${bar} ${pct}% (${count}표)`));
  });

  container.addSeparatorComponents(divider());
  for (let i = 0; i < survey.options.slice(0, 25).length; i += 5) {
    const row = buttonRow(
      ...survey.options.slice(i, i + 5).map((opt, j) =>
        actionButton(`survey_${survey.id}_${i + j}`, opt.slice(0, 80), ButtonStyle.Primary),
      ),
    );
    container.addActionRowComponents(row);
  }
  container.addTextDisplayComponents(
    subtext(`총 ${total}명 참여 · 버튼을 눌러 투표하세요 (다시 누르면 표를 바꿀 수 있어요)`),
  );

  const messageId = await upsertDiscordChannelMessage(survey.channelId, survey.messageId, {
    components: [container.toJSON()],
    flags: COMPONENTS_V2_FLAG,
  });

  if (messageId && messageId !== survey.messageId) {
    await prisma.survey.update({ where: { id: survey.id }, data: { messageId } });
  }
}
