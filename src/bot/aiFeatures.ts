import { ChatInputCommandInteraction, Client, Events, Message, MessageFlags, PermissionFlagsBits } from "discord.js";
import { prisma } from "./prismaClient";
import { createChatCompletion } from "../lib/ai/provider";
import { panel, heading, text } from "../lib/discordComponentsV2";

/**
 * OpenRouter를 써서 AI 비용은 플랫폼이 부담하는 디스코드 전용 기능들.
 * 고객 AI 크레딧(src/lib/ai/engine.ts)과는 완전히 별개 — createChatCompletion을
 * usageTracking의 AsyncLocalStorage 컨텍스트 밖에서 호출해서 과금 집계와 안 섞인다.
 */

const SUMMARY_COOLDOWN_MS = 30_000;
const lastSummaryAt = new Map<string, number>();

export async function handleSummarize(interaction: ChatInputCommandInteraction) {
  if (!interaction.inGuild() || !interaction.channel || !("messages" in interaction.channel)) {
    await interaction.reply({
      components: [text("이 명령어는 채널에서만 쓸 수 있어요.")],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  const last = lastSummaryAt.get(interaction.channelId) ?? 0;
  if (Date.now() - last < SUMMARY_COOLDOWN_MS) {
    await interaction.reply({
      components: [text("너무 자주 요청됐어요. 잠시 후 다시 시도해주세요.")],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  const count = Math.min(Math.max(interaction.options.getInteger("개수") ?? 50, 10), 200);
  await interaction.deferReply();

  try {
    const fetched = await interaction.channel.messages.fetch({ limit: count });
    const transcript = [...fetched.values()]
      .reverse()
      .filter((m) => !m.author.bot && m.content.trim().length > 0)
      .map((m) => `${m.member?.displayName ?? m.author.username}: ${m.content}`)
      .join("\n")
      .slice(-8000); // 비용 상한 — 너무 길면 뒤(최신 대화) 기준으로 자른다

    if (!transcript) {
      await interaction.editReply({ components: [text("요약할 만한 대화가 없어요.")], flags: MessageFlags.IsComponentsV2 });
      return;
    }

    const res = await createChatCompletion(
      {
        messages: [
          {
            role: "system",
            content:
              "디스코드 채널 대화를 한국어로 간결하게 요약해. 핵심 주제/결정사항/중요 포인트 위주로 3~6줄 불릿으로. 인사·잡담은 생략해.",
          },
          { role: "user", content: transcript },
        ],
        max_tokens: 500,
      },
      "haiku",
    );
    const summary = res.choices[0]?.message?.content?.trim() || "요약을 만들지 못했어요.";
    lastSummaryAt.set(interaction.channelId, Date.now());

    const container = panel().addTextDisplayComponents(heading("📝 대화 요약"), text(summary));
    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  } catch (err) {
    console.error("[aiFeatures] 대화 요약 실패:", err);
    await interaction.editReply({ components: [text("요약 중 오류가 발생했어요.")], flags: MessageFlags.IsComponentsV2 });
  }
}

/**
 * AI 실시간 검열 — 메시지마다 LLM을 돌리면 비용이 크니, 너무 짧은 메시지는 건너뛰고
 * (스팸/욕설 한두 마디는 이미 antiSpam/mentionGuard가 따로 처리), 사람당 쿨다운을 둬서
 * 한 사람이 연속으로 많이 써도 검사 호출 자체는 자주 안 나가게 한다.
 */
const MODERATION_MIN_LENGTH = 12;
const MODERATION_COOLDOWN_MS = 15_000;
const lastModerationCheckAt = new Map<string, number>();
const MODERATION_TIMEOUT_MS = 10 * 60_000;

interface ModerationResult {
  violation: boolean;
  category?: string;
  reason?: string;
}

async function classifyMessage(content: string): Promise<ModerationResult | null> {
  try {
    const res = await createChatCompletion(
      {
        messages: [
          {
            role: "system",
            content:
              `디스코드 메시지 하나를 검토해서 규칙 위반인지 판단해. 위반 기준: 사기/피싱 링크 유도, ` +
              `심한 욕설·혐오 발언, 성적으로 노골적인 내용, 불법 상품 거래 권유. 일반 잡담/농담/가벼운 ` +
              `비속어는 위반 아님. 애매하면 위반 아님으로 판단해(과잉 검열 금지).\n` +
              `반드시 JSON으로만 답해: {"violation": boolean, "category": "SCAM|HATE|NSFW|ILLEGAL|기타", "reason": "한 줄 이유"}`,
          },
          { role: "user", content: content.slice(0, 1500) },
        ],
        max_tokens: 150,
        temperature: 0,
      },
      "haiku",
    );
    const raw = res.choices[0]?.message?.content?.trim() ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as ModerationResult;
  } catch (err) {
    console.error("[aiFeatures] 검열 분류 실패:", err);
    return null;
  }
}

/**
 * AI 비전 OCR 검열 — 이미지 첨부가 있으면 이미지 속 텍스트(사기 QR/피싱 링크 안내 등)까지
 * 같이 본다. OpenRouter가 OpenAI 호환이라 image_url에 디스코드 CDN 주소를 그대로 넘기면
 * (base64 인코딩 없이) 자기가 직접 가져다가 본다 — 공개 첨부 URL이라 인증 없이도 받아진다.
 */
const IMAGE_MODERATION_COOLDOWN_MS = 20_000;
const lastImageModerationCheckAt = new Map<string, number>();

async function classifyImage(url: string): Promise<ModerationResult | null> {
  try {
    const res = await createChatCompletion(
      {
        messages: [
          {
            role: "system",
            content:
              `이미지를 보고 안에 있는 텍스트(있다면 OCR로 읽어서)까지 포함해 규칙 위반인지 판단해. ` +
              `위반 기준: 사기/피싱 QR코드나 링크 유도, 혐오 발언, 성적으로 노골적인 내용, 불법 상품 ` +
              `거래 권유. 평범한 스크린샷/사진/밈/게임 화면은 위반 아님. 애매하면 위반 아님으로 판단해(과잉 검열 금지).\n` +
              `반드시 JSON으로만 답해: {"violation": boolean, "category": "SCAM|HATE|NSFW|ILLEGAL|기타", "reason": "한 줄 이유"}`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "이 이미지를 검토해줘." },
              { type: "image_url", image_url: { url } },
            ],
          },
        ],
        max_tokens: 150,
        temperature: 0,
      },
      "haiku",
    );
    const raw = res.choices[0]?.message?.content?.trim() ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as ModerationResult;
  } catch (err) {
    console.error("[aiFeatures] 이미지 검열 분류 실패:", err);
    return null;
  }
}

export function startAiModeration(client: Client, officialGuildId: string) {
  client.on(Events.MessageCreate, async (message) => {
    if (message.guildId !== officialGuildId) return;
    const settings = await prisma.botSettings.findUnique({ where: { id: 1 } }).catch(() => null);
    // 비속어/검열 조치 로그는 운영 로그(logChannelId, 관리자 전용)가 아니라 서브 공지(🔔-알림)에
    // 올린다 — 모든 모더레이션(타임아웃/추방/차단 포함)을 한 채널에서 보고 싶다는 요청에 맞춤
    await moderateMessage(message, settings?.subAnnouncementChannelId);
  });
}

/**
 * 운영진(메시지 관리 권한 보유자)은 검사 대상에서 제외. 텍스트와 이미지(첨부가 있으면) 둘 다
 * 본다 — 어느 쪽이든 위반으로 판단되면 메시지 삭제 + 짧은 타임아웃 + 운영 로그 채널에 기록.
 */
async function moderateMessage(message: Message, logChannelId: string | null | undefined) {
  if (message.author.bot) return;
  if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;

  let result: ModerationResult | null = null;
  let sourceNote = "";

  const imageAttachment = [...message.attachments.values()].find((a) => a.contentType?.startsWith("image/"));
  if (imageAttachment) {
    const last = lastImageModerationCheckAt.get(message.author.id) ?? 0;
    if (Date.now() - last >= IMAGE_MODERATION_COOLDOWN_MS) {
      lastImageModerationCheckAt.set(message.author.id, Date.now());
      result = await classifyImage(imageAttachment.url);
      sourceNote = "이미지(OCR)";
    }
  }

  if (!result?.violation && message.content.trim().length >= MODERATION_MIN_LENGTH) {
    const last = lastModerationCheckAt.get(message.author.id) ?? 0;
    if (Date.now() - last >= MODERATION_COOLDOWN_MS) {
      lastModerationCheckAt.set(message.author.id, Date.now());
      const textResult = await classifyMessage(message.content);
      if (textResult?.violation) {
        result = textResult;
        sourceNote = "텍스트";
      }
    }
  }

  if (!result?.violation) return;
  await takeModerationAction(message, result, sourceNote, logChannelId);
}

async function takeModerationAction(
  message: Message,
  result: ModerationResult,
  sourceNote: string,
  logChannelId: string | null | undefined,
) {
  try {
    await message.delete().catch(() => {});
    if (message.member?.moderatable) {
      await message.member.timeout(MODERATION_TIMEOUT_MS, `AI 검열(${sourceNote}): ${result.category ?? "위반"} — ${result.reason ?? ""}`);
    }
    await message.author
      .send(`⚠️ 메시지가 규칙 위반(${result.category ?? "위반"})으로 판단돼 삭제됐고, ${MODERATION_TIMEOUT_MS / 60_000}분 동안 채팅이 제한됐어요.`)
      .catch(() => {});

    if (logChannelId) {
      const channel = await message.guild?.channels.fetch(logChannelId).catch(() => null);
      if (channel && "send" in channel) {
        const container = panel(0xef4444)
          .addTextDisplayComponents(heading("🤖 AI 검열 조치"))
          .addTextDisplayComponents(
            text(
              `**${message.author.tag}** (${message.author.id})\n감지 경로: ${sourceNote}\n분류: ${result.category ?? "기타"}\n사유: ${result.reason ?? "-"}\n원문: ${message.content.slice(0, 300) || "(텍스트 없음)"}`,
            ),
          );
        await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }
    }
    console.log(`[aiFeatures] ${message.author.tag} 메시지 검열 조치 — ${sourceNote}/${result.category}`);
  } catch (err) {
    console.error("[aiFeatures] 검열 조치 실패:", err);
  }
}
