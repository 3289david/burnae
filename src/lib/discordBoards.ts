import { prisma } from "@/lib/prisma";
import { upsertDiscordChannelMessage, type DiscordButton } from "@/lib/discordNotify";

/**
 * 규칙+인증 임베드와 링크트리 임베드를 "관리자가 설정을 저장할 때마다" 다시 그려서 올린다.
 * 새로 만들지 않고 저장된 메시지 id가 있으면 그 메시지를 그대로 수정한다(핀 고정이 풀리지 않고,
 * 채널이 도배되지 않는다). 버튼 클릭(인증하기)에 실제로 반응하는 건 봇 프로세스(src/bot)의 몫이고,
 * 여기서는 REST로 메시지 내용/버튼만 채널에 올려둔다.
 */
export async function syncRulesMessage(): Promise<void> {
  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });
  if (!settings?.rulesChannelId) return;

  const buttons: DiscordButton[] = [
    { type: 2, style: 3, label: "✅ 인증하기", custom_id: "verify_rules" },
  ];

  const messageId = await upsertDiscordChannelMessage(settings.rulesChannelId, settings.rulesMessageId, {
    embeds: [
      {
        title: settings.rulesTitle,
        description: settings.rulesContent || "아직 규칙이 등록되지 않았어요.",
        color: 0xff6b35,
        footer: { text: "아래 버튼을 눌러 규칙에 동의하고 인증을 완료하세요." },
      },
    ],
    components: [{ type: 1, components: buttons }],
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

  // 디스코드 메시지 하나당 액션로우 최대 5개, 로우 하나당 버튼 최대 5개 = 최대 25개
  const buttons: DiscordButton[] = links.slice(0, 25).map((l) => ({
    type: 2,
    style: 5,
    label: l.label.slice(0, 80),
    url: l.url,
    ...(l.emoji ? { emoji: { name: l.emoji } } : {}),
  }));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push({ type: 1 as const, components: buttons.slice(i, i + 5) });
  }

  const messageId = await upsertDiscordChannelMessage(settings.linktreeChannelId, settings.linktreeMessageId, {
    embeds: [
      {
        title: settings.linktreeTitle,
        description: links.length === 0 ? "아직 등록된 링크가 없어요." : undefined,
        color: 0xff6b35,
      },
    ],
    components: rows,
  });

  if (messageId && messageId !== settings.linktreeMessageId) {
    await prisma.botSettings.update({ where: { id: 1 }, data: { linktreeMessageId: messageId } });
  }
}

/**
 * 설문(투표) 임베드를 그려서 올리거나(처음) 기존 메시지를 최신 투표수로 갱신한다.
 * 관리자가 설문을 만들 때, 그리고 봇이 투표 버튼 클릭을 처리한 직후 둘 다 호출한다.
 */
export async function postOrRefreshSurvey(surveyId: string): Promise<void> {
  const survey = await prisma.survey.findUnique({ where: { id: surveyId } });
  if (!survey) return;

  const votes = await prisma.surveyVote.findMany({ where: { surveyId } });
  const total = votes.length;
  const counts = survey.options.map((_, i) => votes.filter((v) => v.optionIndex === i).length);

  const description = survey.options
    .map((opt, i) => {
      const count = counts[i];
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      const barLength = 12;
      const filled = total > 0 ? Math.round((count / total) * barLength) : 0;
      const bar = "█".repeat(filled) + "░".repeat(barLength - filled);
      return `**${opt}**\n${bar} ${pct}% (${count}표)`;
    })
    .join("\n\n");

  const buttons: DiscordButton[] = survey.options.slice(0, 25).map((opt, i) => ({
    type: 2,
    style: 1,
    label: opt.slice(0, 80),
    custom_id: `survey_${survey.id}_${i}`,
  }));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push({ type: 1 as const, components: buttons.slice(i, i + 5) });
  }

  const messageId = await upsertDiscordChannelMessage(survey.channelId, survey.messageId, {
    embeds: [
      {
        title: `📊 ${survey.question}`,
        description,
        color: 0xff6b35,
        footer: { text: `총 ${total}명 참여 · 버튼을 눌러 투표하세요 (다시 누르면 표를 바꿀 수 있어요)` },
      },
    ],
    components: rows,
  });

  if (messageId && messageId !== survey.messageId) {
    await prisma.survey.update({ where: { id: survey.id }, data: { messageId } });
  }
}
