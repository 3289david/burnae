import dns from "node:dns/promises";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import { prisma } from "@/lib/prisma";
import { PteroClient } from "@/lib/pterodactyl";
import { sendDiscordDM } from "@/lib/discordNotify";

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

/**
 * 검증 통과한 IP를 돌려준다 — fetch()에 원본 hostname을 그대로 넘기면 fetch가 내부적으로
 * DNS를 다시 조회하는데, 그 사이(TTL이 아주 짧은 도메인 등)에 응답이 사설 IP로 바뀌는
 * "DNS 리바인딩"으로 이 검사를 우회할 수 있다 — 그래서 여기서 확인한 IP로 직접 접속해야 한다.
 */
async function assertPublicUrl(url: URL): Promise<{ address: string; family: number }> {
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
  return addresses[0];
}

export async function verifyUrlContainsText(rawUrl: string, requiredText: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("올바른 URL이 아니에요.");
  }
  const { address, family } = await assertPublicUrl(url);

  const text = await new Promise<string>((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      {
        // 접속은 검증된 IP로 직접 하되(리바인딩 방지), Host/SNI는 원래 도메인 이름을 그대로 써야
        // 가상 호스팅(같은 IP에 여러 도메인)이 정상 동작한다
        host: address,
        family,
        servername: url.protocol === "https:" ? url.hostname : undefined,
        path: `${url.pathname}${url.search}`,
        headers: { Host: url.hostname, "User-Agent": "BurnaePromotionBot/1.0 (+https://burnae.kr)" },
        timeout: 8000,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.destroy();
          reject(new Error("리다이렉트되는 주소는 확인할 수 없어요. 최종 페이지 주소를 입력해주세요."));
          return;
        }
        if (status < 200 || status >= 300) {
          res.destroy();
          reject(new Error("페이지를 불러올 수 없어요."));
          return;
        }
        const MAX_BYTES = 2_000_000;
        let bytes = 0;
        let settled = false;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          chunks.push(chunk);
          if (bytes > MAX_BYTES && !settled) {
            settled = true;
            res.destroy();
            resolve(Buffer.concat(chunks).toString("utf-8"));
          }
        });
        res.on("end", () => {
          if (!settled) resolve(Buffer.concat(chunks).toString("utf-8"));
        });
        res.on("error", (err) => {
          if (!settled) reject(err);
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("응답 시간이 초과됐어요.")));
    req.on("error", reject);
    req.end();
  });

  return text.toLowerCase().includes(requiredText.toLowerCase());
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
  }).then(async (completion) => {
    const link = await prisma.discordLink.findUnique({ where: { userId: params.userId } });
    if (link) {
      await sendDiscordDM(
        link.discordUserId,
        `🎁 홍보 포인트 ${params.pointsAwarded}점이 적립됐어요! 대시보드에서 확인해보세요.`,
      ).catch(() => {});
    }
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

/// 하루 동안 이 항목으로 지급 가능한 최대 건수 — 프리셋을 무더기로 찍어내 포인트를 파밍하는 걸 막는다.
/// 프리셋 자체는 이 한도와 무관하게 계속 등록/공개할 수 있고, 포인트만 하루 이 개수까지만 지급된다.
const CUSTOM_PRESET_DAILY_REWARD_CAP = 5;

/** 유저가 커뮤니티 프리셋을 새로 공개했을 때 포인트 지급 시도. 일일 한도 초과 시 조용히 지급 생략 */
export async function rewardCustomPresetPublished(userId: string, presetId: string) {
  const task = await prisma.promotionTask.findUnique({ where: { key: "custom_preset_published" } });
  if (!task || !task.active) return null;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentCount = await prisma.promotionCompletion.count({
    where: { userId, taskId: task.id, createdAt: { gte: since } },
  });
  if (recentCount >= CUSTOM_PRESET_DAILY_REWARD_CAP) return null;

  return awardPoints({
    userId,
    taskId: task.id,
    pointsAwarded: task.pointsAwarded,
    relatedUserId: presetId,
  });
}

/** 신고 누적으로 프리셋이 자동 비공개될 때, 그 프리셋 등록으로 지급됐던 포인트를 회수한다 */
export async function revokeCustomPresetPoints(presetId: string, creatorId: string) {
  const task = await prisma.promotionTask.findUnique({ where: { key: "custom_preset_published" } });
  if (!task) return;

  await prisma.$transaction(async (tx) => {
    const completion = await tx.promotionCompletion.findUnique({
      where: { taskId_userId_relatedUserId: { taskId: task.id, userId: creatorId, relatedUserId: presetId } },
    });
    if (!completion || completion.status !== "APPROVED") return;

    await tx.promotionCompletion.update({ where: { id: completion.id }, data: { status: "REJECTED" } });
    const user = await tx.user.findUniqueOrThrow({ where: { id: creatorId } });
    const newPoints = Math.max(0, user.promotionPoints - completion.pointsAwarded);
    await tx.user.update({ where: { id: creatorId }, data: { promotionPoints: newPoints } });
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
