import { Client, Events, GuildVerificationLevel, Guild } from "discord.js";
import { prisma } from "./prismaClient";

/**
 * 레이드(짧은 시간에 봇 계정 대량 가입) 감지 — 10초 안에 5명 이상 가입하면 디스코드 자체
 * 인증 레벨(verificationLevel)을 최고(VeryHigh, 휴대폰 인증 계정만 채팅 가능)로 올려서
 * 신규 레이드 계정의 활동을 막는다. 역할/채널 권한은 건드리지 않아서 기존 멤버는 전혀
 * 영향받지 않고, 일정 시간 뒤 원래 레벨로 자동 복구된다(킥/밴 같은 파괴적인 조치는 하지 않음).
 */
const RAID_WINDOW_MS = 10_000;
const RAID_JOIN_THRESHOLD = 5;
const LOCKDOWN_MS = 15 * 60_000;

let joinTimestamps: number[] = [];
let lockdownActive = false;

async function notifyAdmin(client: Client, message: string) {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) return;
  const link = await prisma.discordLink.findUnique({ where: { userId: admin.id } });
  if (!link) return;
  const adminUser = await client.users.fetch(link.discordUserId).catch(() => null);
  await adminUser?.send(message).catch(() => {});
}

async function triggerLockdown(guild: Guild, client: Client) {
  lockdownActive = true;
  const originalLevel = guild.verificationLevel;

  try {
    await guild.setVerificationLevel(GuildVerificationLevel.VeryHigh, "레이드 의심 — 자동 보안 강화");
    console.log("[antiRaid] 레이드 감지 — 서버 인증 레벨을 최고로 올렸어요.");
    await notifyAdmin(
      client,
      `🚨 짧은 시간(10초)에 많은 인원이 가입해서 레이드로 의심돼요. 서버 인증 레벨을 최고로 올려서 ` +
        `휴대폰 인증 안 된 신규 계정의 채팅을 막았어요(킥/밴은 안 했어요). ${LOCKDOWN_MS / 60000}분 뒤 ` +
        `자동으로 원래대로 돌아가요. 최근 가입자 목록을 확인해서 필요하면 직접 조치해주세요.`,
    );
  } catch (err) {
    console.error("[antiRaid] 인증 레벨 변경 실패(봇에 서버 관리 권한이 있는지 확인):", err);
  }

  setTimeout(async () => {
    try {
      await guild.setVerificationLevel(originalLevel, "레이드 대응 종료 — 원래 인증 레벨로 복구");
      console.log("[antiRaid] 잠금 해제, 원래 인증 레벨로 복구");
    } catch (err) {
      console.error("[antiRaid] 인증 레벨 복구 실패:", err);
    } finally {
      lockdownActive = false;
    }
  }, LOCKDOWN_MS);
}

export function startAntiRaid(client: Client, officialGuildId: string) {
  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.guild.id !== officialGuildId || lockdownActive) return;

    const now = Date.now();
    joinTimestamps = joinTimestamps.filter((t) => now - t < RAID_WINDOW_MS);
    joinTimestamps.push(now);

    if (joinTimestamps.length >= RAID_JOIN_THRESHOLD) {
      joinTimestamps = [];
      await triggerLockdown(member.guild, client);
    }
  });
}
