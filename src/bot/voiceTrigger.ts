import { Client, Events, VoiceState, ChannelType, PermissionFlagsBits, Guild, VoiceChannel } from "discord.js";
import { prisma } from "./prismaClient";
import { createChatCompletion } from "../lib/ai/provider";

/**
 * "임시 개인 음성방"(Voice Trigger) + "스마트 보이스" — voiceTriggerChannelId에 들어가면 자기만의
 * 음성채널이 새로 만들어지고 거기로 옮겨진다(비면 자동 삭제). 그 채널 안에서 인원이 바뀌거나
 * 화면공유가 토글되거나 채팅이 올라오면, 잠깐 조용해지길 기다렸다가(디바운스) OpenRouter의
 * 저렴한 모델로 그 순간 분위기에 맞는 방 이름을 지어서 자동으로 바꿔준다.
 *
 * AI 비용은 플랫폼이 부담하는 거라(고객 AI 크레딧과 무관) src/lib/ai/provider.ts의
 * createChatCompletion을 usageTracking 컨텍스트 밖에서 직접 호출한다 — recordUsage는 그 경우
 * 조용히 아무 일도 안 하므로 고객 크레딧 차감과 절대 섞이지 않는다.
 */
const RENAME_COOLDOWN_MS = 6 * 60_000; // 디스코드는 채널 이름 변경을 10분에 2번까지만 허용 — 여유를 둔다
const DEBOUNCE_MS = 20_000; // 짧은 시간에 여러 번 들고나는 걸 하나로 묶어서 AI 호출을 아낀다

const pendingRenameTimers = new Map<string, NodeJS.Timeout>();

export function startVoiceTrigger(client: Client, officialGuildId: string) {
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    handleVoiceStateUpdate(oldState, newState, officialGuildId).catch((err) => {
      console.error("[voiceTrigger] 처리 실패:", err);
    });
  });

  reconcileOnStartup(client, officialGuildId).catch((err) => {
    console.error("[voiceTrigger] 시작 시 정리 실패:", err);
  });
}

/** 봇이 재시작되는 동안 놓친 퇴장 이벤트 때문에 빈 임시 채널이 안 지워진 채로 남아있을 수 있어서, 시작할 때 한 번 정리한다 */
async function reconcileOnStartup(client: Client, officialGuildId: string) {
  const rows = await prisma.tempVoiceChannel.findMany();
  if (rows.length === 0) return;
  const guild = await client.guilds.fetch(officialGuildId).catch(() => null);
  if (!guild) return;

  for (const row of rows) {
    const channel = await guild.channels.fetch(row.channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildVoice || channel.members.size === 0) {
      await channel?.delete("임시 음성방 정리(봇 재시작 보정)").catch(() => {});
      await prisma.tempVoiceChannel.delete({ where: { id: row.id } }).catch(() => {});
    }
  }
}

async function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState, officialGuildId: string) {
  const guild = newState.guild ?? oldState.guild;
  if (guild.id !== officialGuildId) return;

  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });

  if (
    settings?.voiceTriggerChannelId &&
    newState.channelId === settings.voiceTriggerChannelId &&
    oldState.channelId !== newState.channelId
  ) {
    await createTempChannelFor(newState, settings.voiceTriggerChannelId);
  }

  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    await cleanupIfEmpty(oldState.channelId, guild);
  }

  for (const channelId of new Set([oldState.channelId, newState.channelId].filter((id): id is string => !!id))) {
    scheduleSmartRename(channelId, guild);
  }
}

async function createTempChannelFor(state: VoiceState, triggerChannelId: string) {
  const member = state.member;
  if (!member || !state.guild) return;

  const triggerChannel = await state.guild.channels.fetch(triggerChannelId).catch(() => null);
  const parentId = triggerChannel && "parentId" in triggerChannel ? triggerChannel.parentId : null;

  try {
    const channel = await state.guild.channels.create({
      name: `${member.displayName}의 방`.slice(0, 90),
      type: ChannelType.GuildVoice,
      parent: parentId ?? undefined,
      permissionOverwrites: [
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.MoveMembers,
            PermissionFlagsBits.MuteMembers,
            PermissionFlagsBits.DeafenMembers,
          ],
        },
      ],
      reason: `${member.user.tag}님의 임시 음성방`,
    });
    await prisma.tempVoiceChannel.create({ data: { channelId: channel.id, ownerDiscordId: member.id } });
    await member.voice.setChannel(channel).catch(() => {});
  } catch (err) {
    console.error("[voiceTrigger] 임시 음성방 생성 실패:", err);
  }
}

async function cleanupIfEmpty(channelId: string, guild: Guild) {
  const row = await prisma.tempVoiceChannel.findUnique({ where: { channelId } });
  if (!row) return;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    await prisma.tempVoiceChannel.delete({ where: { channelId } }).catch(() => {});
    return;
  }
  if (channel.members.size === 0) {
    await channel.delete("임시 음성방 비어서 자동 삭제").catch(() => {});
    await prisma.tempVoiceChannel.delete({ where: { channelId } }).catch(() => {});
    const timer = pendingRenameTimers.get(channelId);
    if (timer) {
      clearTimeout(timer);
      pendingRenameTimers.delete(channelId);
    }
  }
}

function scheduleSmartRename(channelId: string, guild: Guild) {
  const existing = pendingRenameTimers.get(channelId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    pendingRenameTimers.delete(channelId);
    performSmartRename(channelId, guild).catch((err) => console.error("[voiceTrigger] 스마트 리네임 실패:", err));
  }, DEBOUNCE_MS);
  pendingRenameTimers.set(channelId, timer);
}

async function performSmartRename(channelId: string, guild: Guild) {
  // 추적 중인 임시 채널만 건드린다 — 트리거 채널 자체나 다른 어떤 채널도 절대 자동으로 이름이 안 바뀐다
  const row = await prisma.tempVoiceChannel.findUnique({ where: { channelId } });
  if (!row) return;
  if (row.lastRenamedAt && Date.now() - row.lastRenamedAt.getTime() < RENAME_COOLDOWN_MS) return;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildVoice) return;
  if (channel.members.size === 0) return;

  const memberNames = [...channel.members.values()].map((m) => m.displayName).slice(0, 10);
  const anyStreaming = [...channel.members.values()].some((m) => m.voice.streaming || m.voice.selfVideo);

  let recentChat: string[] = [];
  try {
    const msgs = await (channel as VoiceChannel).messages.fetch({ limit: 8 });
    recentChat = [...msgs.values()]
      .reverse()
      .map((m) => `${m.member?.displayName ?? m.author.username}: ${m.content}`)
      .filter((l) => l.split(":").slice(1).join(":").trim().length > 1)
      .slice(-8);
  } catch {
    // 이 음성채널에 텍스트 채팅 권한이 없거나 메시지가 없으면 조용히 건너뜀
  }

  if (memberNames.length === 0) return;

  const prompt = `다음은 디스코드 음성방 안의 현재 상황이야. 이 정보를 참고해서 방 이름을 센스있게 지어줘.
참여 인원: ${memberNames.join(", ")}
화면 공유/영상 중: ${anyStreaming ? "예" : "아니오"}
최근 채팅: ${recentChat.length > 0 ? recentChat.join("\n") : "없음"}

규칙:
- 한국어로, 20자 이내, 이모지 1개 정도만 써.
- 참고할 정보가 거의 없으면 그냥 무난하고 짧은 이름으로 지어.
- 반드시 아래 JSON 형식으로만 답해, 다른 말은 절대 하지 마: {"name": "방 이름"}`;

  try {
    const res = await createChatCompletion(
      { messages: [{ role: "user", content: prompt }], max_tokens: 60, temperature: 0.8 },
      "haiku",
    );
    const raw = res.choices[0]?.message?.content?.trim() ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return;
    const parsed = JSON.parse(match[0]) as { name?: string };
    const name = parsed.name?.trim().slice(0, 90);
    if (!name) return;

    await channel.setName(name, "스마트 보이스 자동 이름 변경");
    await prisma.tempVoiceChannel.update({ where: { channelId }, data: { lastRenamedAt: new Date() } });
  } catch (err) {
    console.error("[voiceTrigger] AI 이름 생성 실패:", err);
  }
}
