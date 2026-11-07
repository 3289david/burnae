import { AuditLogEvent, Client, Events, GuildAuditLogsEntry, MessageFlags } from "discord.js";
import { prisma } from "./prismaClient";
import { panel, heading, text } from "../lib/discordComponentsV2";

/**
 * 타임아웃/추방/차단은 AI 검열(aiFeatures.ts)이나 antiSpam.ts처럼 "봇이 직접" 하는 경우도
 * 있고, 운영진이 디스코드 네이티브 UI로 직접 하는 경우도 있다. 후자는 그 모듈들이 알 수 없으니
 * 디스코드 감사 로그(Audit Log)를 구독해서 "누가 뭘 했는지"를 전부 잡아낸다 — 단, 봇이 실행한
 * 조치는 이미 해당 모듈이 상세한 사유와 함께 같은 채널(서브 공지)에 올리므로, 여기서는 집행자가
 * 봇이 아닌 경우(=운영진이 직접)만 다시 올려서 중복 로그가 안 생기게 한다.
 */
function describeEntry(entry: GuildAuditLogsEntry): { label: string; color: number } | null {
  switch (entry.action) {
    case AuditLogEvent.MemberKick:
      return { label: "👋 추방", color: 0xf97316 };
    case AuditLogEvent.MemberBanAdd:
      return { label: "🔨 차단", color: 0xef4444 };
    case AuditLogEvent.MemberBanRemove:
      return { label: "🔓 차단 해제", color: 0x22c55e };
    case AuditLogEvent.MemberUpdate: {
      const timeoutChange = entry.changes.find((c) => c.key === "communication_disabled_until");
      if (!timeoutChange) return null;
      return timeoutChange.new ? { label: "⏳ 타임아웃", color: 0xf59e0b } : { label: "⏳ 타임아웃 해제", color: 0x22c55e };
    }
    default:
      return null;
  }
}

export function startModerationAuditLog(client: Client, officialGuildId: string) {
  client.on(Events.GuildAuditLogEntryCreate, async (entry, guild) => {
    if (guild.id !== officialGuildId) return;
    if (entry.executorId === client.user?.id) return; // 봇이 한 조치는 각 모듈이 이미 로그함

    const described = describeEntry(entry);
    if (!described) return;

    const settings = await prisma.botSettings.findUnique({ where: { id: 1 } }).catch(() => null);
    if (!settings?.subAnnouncementChannelId) return;
    const channel = await guild.channels.fetch(settings.subAnnouncementChannelId).catch(() => null);
    if (!channel || !channel.isTextBased() || !("send" in channel)) return;

    const targetLine = entry.targetId ? `<@${entry.targetId}> (${entry.targetId})` : "알 수 없음";
    const executorLine = entry.executorId ? `<@${entry.executorId}>` : "알 수 없음";

    const container = panel(described.color)
      .addTextDisplayComponents(heading(described.label))
      .addTextDisplayComponents(
        text(`대상: ${targetLine}\n집행: ${executorLine}\n사유: ${entry.reason ?? "-"}`),
      );
    await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
  });
}
