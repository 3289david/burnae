/**
 * 게이트웨이 연결 없이 REST API만으로 디스코드를 조작한다.
 * (봇 프로세스가 아닌 Next.js 앱/크론 스크립트처럼 짧게 실행되고 끝나는 곳에서 쓰기 위함 —
 * 채널에 메시지를 올리거나 역할을 주는 건 REST만으로 충분하고, 게이트웨이 상시 연결이 필요 없다.
 * 버튼 클릭 같은 실시간 상호작용에 응답하는 것만 봇 프로세스(src/bot)가 담당한다.)
 */
const DISCORD_API = "https://discord.com/api/v10";

function botHeaders() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return null;
  return { Authorization: `Bot ${token}`, "Content-Type": "application/json" };
}

export async function sendDiscordDM(discordUserId: string, content: string): Promise<boolean> {
  const headers = botHeaders();
  if (!headers) return false;

  try {
    const channelRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
      method: "POST",
      headers,
      body: JSON.stringify({ recipient_id: discordUserId }),
    });
    if (!channelRes.ok) return false;
    const channel = await channelRes.json();

    const msgRes = await fetch(`${DISCORD_API}/channels/${channel.id}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ content }),
    });
    return msgRes.ok;
  } catch (err) {
    console.error("[discordNotify] DM 전송 실패:", err);
    return false;
  }
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
}

export interface DiscordButton {
  type: 2;
  style: 1 | 2 | 3 | 4 | 5;
  label: string;
  custom_id?: string;
  url?: string;
  emoji?: { name: string };
}

interface ChannelMessagePayload {
  content?: string;
  embeds?: DiscordEmbed[];
  components?: { type: 1; components: DiscordButton[] }[];
}

/** 채널에 새 메시지를 올리고, 만든 메시지의 id를 돌려준다 (다음에 편집할 수 있도록) */
export async function sendDiscordChannelMessage(
  channelId: string,
  payload: ChannelMessagePayload,
): Promise<string | null> {
  const headers = botHeaders();
  if (!headers) return null;
  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("[discordNotify] 채널 메시지 전송 실패:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const message = await res.json();
    return message.id as string;
  } catch (err) {
    console.error("[discordNotify] 채널 메시지 전송 실패:", err);
    return null;
  }
}

/** 기존 메시지를 편집한다. 메시지가 지워졌거나 못 찾으면 false를 돌려줘서 호출부가 새로 올리게 한다 */
export async function editDiscordChannelMessage(
  channelId: string,
  messageId: string,
  payload: ChannelMessagePayload,
): Promise<boolean> {
  const headers = botHeaders();
  if (!headers) return false;
  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages/${messageId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (err) {
    console.error("[discordNotify] 채널 메시지 수정 실패:", err);
    return false;
  }
}

/**
 * 채널 메시지를 "있으면 수정, 없거나 안 주어졌으면 새로 생성"한다.
 * 관리자가 규칙/링크트리 설정을 저장할 때마다 매번 새 메시지를 만들지 않고 하나를 계속 갱신하는 데 쓴다.
 */
export async function upsertDiscordChannelMessage(
  channelId: string,
  existingMessageId: string | null | undefined,
  payload: ChannelMessagePayload,
): Promise<string | null> {
  if (existingMessageId) {
    const ok = await editDiscordChannelMessage(channelId, existingMessageId, payload);
    if (ok) return existingMessageId;
  }
  return sendDiscordChannelMessage(channelId, payload);
}

/** 길드 멤버에게 역할을 부여한다. 연동 안 된 유저이거나 실패해도 예외를 던지지 않고 false만 돌려준다 */
export async function addDiscordRole(discordUserId: string, roleId: string): Promise<boolean> {
  const headers = botHeaders();
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!headers || !guildId) return false;
  try {
    const res = await fetch(
      `${DISCORD_API}/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`,
      { method: "PUT", headers },
    );
    return res.ok;
  } catch (err) {
    console.error("[discordNotify] 역할 부여 실패:", err);
    return false;
  }
}
