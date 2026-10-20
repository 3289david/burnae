import { prisma } from "@/lib/prisma";
import { sendDiscordDM } from "@/lib/discordNotify";
import type { Server } from "@/generated/prisma/client";

/** 서버에서 일어난 일(배포 결과, 리소스 경고 등)을 소유자에게 디스코드 DM으로 알리고
 * (연동 안 돼 있으면 건너뜀), 서버에 외부 알림 웹훅(Slack/Discord Incoming Webhook)이
 * 설정돼 있으면 그쪽에도 같은 내용을 보낸다. deploy.ts/maintenance-cron.ts에서 공용으로 쓴다. */
export async function notifyServerEvent(
  server: Pick<Server, "id" | "ownerId" | "deployNotifyWebhookUrl">,
  message: string,
): Promise<void> {
  const link = await prisma.discordLink.findUnique({ where: { userId: server.ownerId } });
  if (link) {
    await sendDiscordDM(link.discordUserId, message).catch(() => {});
  }

  if (server.deployNotifyWebhookUrl) {
    // Discord/Slack Incoming Webhook 둘 다 받아들이는 키를 같이 보낸다(Discord는 content,
    // Slack은 text를 읽고 서로 모르는 키는 무시한다) — 호스트별 분기 없이 하나로 호환되게
    await fetch(server.deployNotifyWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message, text: message }),
    }).catch((err) => console.error(`[notify] 서버 ${server.id} 외부 웹훅 알림 실패:`, err));
  }
}
