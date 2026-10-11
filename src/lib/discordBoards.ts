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
  ButtonStyle,
  COMPONENTS_V2_FLAG,
} from "@/lib/discordComponentsV2";

/**
 * 규칙+인증 패널과 링크트리 패널을 "관리자가 설정을 저장할 때마다" 다시 그려서 올린다.
 * 새로 만들지 않고 저장된 메시지 id가 있으면 그 메시지를 그대로 수정한다(핀 고정이 풀리지 않고,
 * 채널이 도배되지 않는다). 버튼 클릭(인증하기)에 실제로 반응하는 건 봇 프로세스(src/bot)의 몫이고,
 * 여기서는 REST로 Components V2 패널만 채널에 올려둔다.
 */
export async function syncRulesMessage(): Promise<void> {
  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });
  if (!settings?.rulesChannelId) return;

  const container = panel()
    .addTextDisplayComponents(heading(settings.rulesTitle))
    .addTextDisplayComponents(text(settings.rulesContent || "아직 규칙이 등록되지 않았어요."))
    .addSeparatorComponents(divider())
    .addActionRowComponents(buttonRow(actionButton("verify_rules", "✅ 인증하기", ButtonStyle.Success)))
    .addTextDisplayComponents(subtext("위 버튼을 눌러 규칙에 동의하고 인증을 완료하세요."));

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
