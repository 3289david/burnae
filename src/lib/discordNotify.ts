/**
 * 게이트웨이 연결 없이 REST API만으로 디스코드 DM을 보낸다.
 * (봇 프로세스가 아닌 크론 스크립트처럼 짧게 실행되고 끝나는 곳에서 쓰기 위함)
 */
const DISCORD_API = "https://discord.com/api/v10";

export async function sendDiscordDM(discordUserId: string, content: string): Promise<boolean> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return false;

  try {
    const channelRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_id: discordUserId }),
    });
    if (!channelRes.ok) return false;
    const channel = await channelRes.json();

    const msgRes = await fetch(`${DISCORD_API}/channels/${channel.id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    return msgRes.ok;
  } catch (err) {
    console.error("[discordNotify] DM 전송 실패:", err);
    return false;
  }
}
