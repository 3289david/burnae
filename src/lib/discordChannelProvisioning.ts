import { prisma } from "@/lib/prisma";

/**
 * 관리자가 채널을 직접 만들고 ID를 복사해 붙여넣는 수고를 없앤다 — BotSettings에서
 * 채널 ID가 비어있는 항목만 골라 디스코드에 실제 채널을 만들고 ID를 바로 저장한다.
 * 봇 프로세스(src/bot)가 아니라 Next.js 앱에서 실행되므로 게이트웨이 없이 REST만 쓴다.
 */
const DISCORD_API = "https://discord.com/api/v10";
const CATEGORY_NAME = "Burnae 운영";
/// @@everyone의 VIEW_CHANNEL 권한 비트 — 관리자 전용 채널에서 끈다
const VIEW_CHANNEL_BIT = "1024";

interface ChannelSpec {
  settingsField: "rulesChannelId" | "linktreeChannelId" | "statusBoardChannelId" | "announcementChannelId" | "welcomeChannelId" | "logChannelId" | "nodeStatusChannelId";
  name: string;
  topic: string;
  adminOnly?: boolean;
}

const CHANNEL_SPECS: ChannelSpec[] = [
  { settingsField: "welcomeChannelId", name: "환영", topic: "새 멤버 환영 메시지가 자동으로 올라와요" },
  { settingsField: "rulesChannelId", name: "규칙", topic: "서버 이용 규칙 + 인증" },
  { settingsField: "announcementChannelId", name: "공지사항", topic: "Burnae 공식 공지" },
  { settingsField: "linktreeChannelId", name: "링크", topic: "Burnae 관련 링크 모음" },
  { settingsField: "statusBoardChannelId", name: "실시간-현황", topic: "전체 서버 실시간 통계 (1분마다 자동 갱신)" },
  { settingsField: "logChannelId", name: "운영-로그", topic: "서버 생성/삭제/이전 기록", adminOnly: true },
  { settingsField: "nodeStatusChannelId", name: "노드-상태", topic: "노드별 RAM/CPU/저장공간 점유율 (관리자용)", adminOnly: true },
];

function botHeaders() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return null;
  return { Authorization: `Bot ${token}`, "Content-Type": "application/json" };
}

async function findOrCreateCategory(guildId: string, headers: Record<string, string>): Promise<string | null> {
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, { headers });
  if (res.ok) {
    const channels = (await res.json()) as { id: string; type: number; name: string }[];
    const existing = channels.find((c) => c.type === 4 && c.name === CATEGORY_NAME);
    if (existing) return existing.id;
  }
  const created = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: CATEGORY_NAME, type: 4 }),
  });
  if (!created.ok) return null;
  const data = await created.json();
  return data.id ?? null;
}

export interface ProvisionResult {
  created: { field: string; channelId: string }[];
  failed: { field: string; error: string }[];
}

export async function provisionMissingChannels(): Promise<ProvisionResult> {
  const guildId = process.env.DISCORD_GUILD_ID;
  const headers = botHeaders();
  const result: ProvisionResult = { created: [], failed: [] };
  if (!guildId || !headers) {
    result.failed.push({ field: "_setup", error: "DISCORD_GUILD_ID 또는 DISCORD_BOT_TOKEN이 설정되지 않았어요." });
    return result;
  }

  const settings = await prisma.botSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  const missing = CHANNEL_SPECS.filter((spec) => !settings[spec.settingsField]);
  if (missing.length === 0) return result;

  const categoryId = await findOrCreateCategory(guildId, headers);

  for (const spec of missing) {
    try {
      const body: Record<string, unknown> = {
        name: spec.name,
        type: 0,
        topic: spec.topic,
        parent_id: categoryId ?? undefined,
      };
      if (spec.adminOnly) {
        body.permission_overwrites = [{ id: guildId, type: 0, deny: VIEW_CHANNEL_BIT }];
      }
      const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.text();
        result.failed.push({ field: spec.settingsField, error: `${res.status} ${errBody.slice(0, 200)}` });
        continue;
      }
      const channel = await res.json();
      await prisma.botSettings.update({ where: { id: 1 }, data: { [spec.settingsField]: channel.id } });
      result.created.push({ field: spec.settingsField, channelId: channel.id });
    } catch (err) {
      result.failed.push({ field: spec.settingsField, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
