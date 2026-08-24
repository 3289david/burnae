import dns from "node:dns/promises";
import net from "node:net";
import { prisma } from "@/lib/prisma";
import { PteroClient } from "@/lib/pterodactyl";

/**
 * 서버 홍보(20여 가지 방법) → 포인트 적립 → 무료 서버 교환 시스템.
 * 자동 확인 가능한 방식만 실제로 자동 처리하고, 외부 사이트 스크린샷 인증처럼 우리가
 * 신뢰성 있게 검증할 수 없는 방식은 MANUAL_REVIEW로 분류해 관리자가 직접 승인한다.
 */

// ── URL_CONTAINS_LINK: 유저가 제출한 공개 URL을 서버가 직접 열어서 문구 포함 여부를 확인 ──
// SSRF 방지: http(s)만 허용, 사설/루프백/링크로컬 IP로 풀리는 호스트는 차단, 리다이렉트는 실패 처리,
// 응답은 최대 2MB만 읽는다.

function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // 링크로컬 / 클라우드 메타데이터
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1") return true;
  if (lower.startsWith("fe80:")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.split(":").pop()!;
    if (net.isIPv4(v4)) return isPrivateOrReservedIp(v4);
  }
  return false;
}

async function assertPublicUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("http/https 주소만 사용할 수 있어요.");
  }
  if (url.hostname.toLowerCase() === "localhost") {
    throw new Error("접근할 수 없는 주소예요.");
  }
  const addresses = await dns.lookup(url.hostname, { all: true }).catch(() => []);
  if (addresses.length === 0) throw new Error("주소를 확인할 수 없어요.");
  for (const { address } of addresses) {
    if (isPrivateOrReservedIp(address)) throw new Error("접근할 수 없는 주소예요.");
  }
}

export async function verifyUrlContainsText(rawUrl: string, requiredText: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("올바른 URL이 아니에요.");
  }
  await assertPublicUrl(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url.toString(), {
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "BurnaePromotionBot/1.0 (+https://burnae.kr)" },
    });
    if (res.status >= 300 && res.status < 400) {
      throw new Error("리다이렉트되는 주소는 확인할 수 없어요. 최종 페이지 주소를 입력해주세요.");
    }
    if (!res.ok) throw new Error("페이지를 불러올 수 없어요.");

    const reader = res.body?.getReader();
    let text = "";
    if (reader) {
      const decoder = new TextDecoder();
      const MAX_BYTES = 2_000_000;
      let bytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        text += decoder.decode(value, { stream: true });
        if (bytes > MAX_BYTES) break;
      }
      await reader.cancel().catch(() => {});
    } else {
      text = await res.text();
    }
    return text.toLowerCase().includes(requiredText.toLowerCase());
  } finally {
    clearTimeout(timeout);
  }
}

// ── DISCORD_MEMBER: 공식 디스코드 서버 가입 여부 ──
export async function checkDiscordMembership(discordUserId: string): Promise<boolean> {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!token || !guildId) return false;

  const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}`, {
    headers: { Authorization: `Bot ${token}` },
  });
  return res.status === 200;
}

// ── SERVER_MOTD_BRANDED: 본인 서버 server.properties의 motd에 문구 포함 여부 ──
export async function checkServerMotdBranded(
  pterodactylIdentifier: string,
  requiredText: string,
): Promise<boolean> {
  const content = await PteroClient.readFile(pterodactylIdentifier, "/server.properties");
  const line = content.split("\n").find((l) => l.trim().toLowerCase().startsWith("motd="));
  if (!line) return false;
  const motd = line.slice(line.indexOf("=") + 1);
  return motd.toLowerCase().includes(requiredText.toLowerCase());
}

// ── 포인트 지급 (자동 확인된 건 — 즉시 지급) ──
export async function awardPoints(params: {
  userId: string;
  taskId: string;
  pointsAwarded: number;
  relatedUserId?: string;
  proofUrl?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const completion = await tx.promotionCompletion.create({
      data: {
        userId: params.userId,
        taskId: params.taskId,
        relatedUserId: params.relatedUserId,
        proofUrl: params.proofUrl,
        pointsAwarded: params.pointsAwarded,
        status: "APPROVED",
      },
    });
    await tx.user.update({
      where: { id: params.userId },
      data: { promotionPoints: { increment: params.pointsAwarded } },
    });
    return completion;
  });
}

/** MANUAL_REVIEW 방식 제출 — 포인트는 관리자가 승인해야 지급된다 */
export async function submitForManualReview(params: {
  userId: string;
  taskId: string;
  pointsAwarded: number;
  proofUrl: string;
}) {
  return prisma.promotionCompletion.create({
    data: {
      userId: params.userId,
      taskId: params.taskId,
      proofUrl: params.proofUrl,
      pointsAwarded: params.pointsAwarded,
      status: "PENDING_REVIEW",
    },
  });
}

/** 관리자가 MANUAL_REVIEW 제출 건을 승인/반려한다 */
export async function reviewCompletion(completionId: string, approve: boolean) {
  return prisma.$transaction(async (tx) => {
    const completion = await tx.promotionCompletion.findUniqueOrThrow({ where: { id: completionId } });
    if (completion.status !== "PENDING_REVIEW") {
      throw new Error("이미 처리된 건이에요.");
    }
    const updated = await tx.promotionCompletion.update({
      where: { id: completionId },
      data: { status: approve ? "APPROVED" : "REJECTED" },
    });
    if (approve) {
      await tx.user.update({
        where: { id: completion.userId },
        data: { promotionPoints: { increment: completion.pointsAwarded } },
      });
    }
    return updated;
  });
}

/** 신규 가입자가 추천 코드를 달고 들어왔을 때, 추천인에게 REFERRAL_SIGNUP 포인트 지급 */
export async function rewardReferralSignup(referrerUserId: string, newUserId: string) {
  const task = await prisma.promotionTask.findUnique({ where: { key: "referral_signup" } });
  if (!task || !task.active) return;

  const existing = await prisma.promotionCompletion.findUnique({
    where: { taskId_userId_relatedUserId: { taskId: task.id, userId: referrerUserId, relatedUserId: newUserId } },
  });
  if (existing) return;

  await awardPoints({
    userId: referrerUserId,
    taskId: task.id,
    pointsAwarded: task.pointsAwarded,
    relatedUserId: newUserId,
  });
}

/** 추천받은 친구가 첫 유료 서버를 만들었을 때, 추천인에게 REFERRAL_FIRST_PAYMENT 포인트 지급 */
export async function rewardReferralFirstPayment(referrerUserId: string, referredUserId: string) {
  const task = await prisma.promotionTask.findUnique({ where: { key: "referral_first_payment" } });
  if (!task || !task.active) return;

  const existing = await prisma.promotionCompletion.findUnique({
    where: {
      taskId_userId_relatedUserId: { taskId: task.id, userId: referrerUserId, relatedUserId: referredUserId },
    },
  });
  if (existing) return;

  await awardPoints({
    userId: referrerUserId,
    taskId: task.id,
    pointsAwarded: task.pointsAwarded,
    relatedUserId: referredUserId,
  });
}
