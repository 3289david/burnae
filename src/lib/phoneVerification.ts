import crypto from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { checkMessageExists, isValidKoreanMobileNumber, OctomoError, OCTOMO_TARGET_NUMBER } from "@/lib/octomo";

const VERIFICATION_TTL_MINUTES = 10;

/**
 * 웹 대시보드(/api/phone-verification/*)와 디스코드 봇(/휴대폰인증) 양쪽에서 똑같이 쓰는
 * 휴대폰 인증 핵심 로직. 어느 쪽에서 왔든 OCTOMO 조회/DB 반영 동작이 달라지면 안 되므로
 * 여기 한 곳에만 둔다.
 */
export class PhoneVerificationError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "PhoneVerificationError";
  }
}

export async function startPhoneVerification(
  prisma: PrismaClient,
  userId: string,
  phoneNumberRaw: string,
): Promise<{ code: string; targetNumber: string; expiresInMinutes: number }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.verifiedPhoneNumber) {
    throw new PhoneVerificationError("이미 휴대폰 인증이 완료된 계정이에요.", 409);
  }

  const phoneNumber = phoneNumberRaw.replace(/[^0-9]/g, "");
  if (!isValidKoreanMobileNumber(phoneNumber)) {
    throw new PhoneVerificationError("휴대폰 번호는 010으로 시작하는 11자리 숫자여야 해요.", 422);
  }

  const existingOwner = await prisma.user.findUnique({ where: { verifiedPhoneNumber: phoneNumber } });
  if (existingOwner) {
    throw new PhoneVerificationError("이미 다른 계정에서 인증된 번호예요.", 409);
  }

  // 6자리 숫자 코드 — 너무 짧으면 다른 사람이 아무 문자나 보내서 우연히 통과할 수 있어서 적당히 길게
  const code = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MINUTES * 60 * 1000);

  await prisma.phoneVerificationRequest.upsert({
    where: { userId },
    update: { phoneNumber, code, createdAt: new Date(), expiresAt },
    create: { userId, phoneNumber, code, expiresAt },
  });

  return { code, targetNumber: OCTOMO_TARGET_NUMBER, expiresInMinutes: VERIFICATION_TTL_MINUTES };
}

/** 반환값 true/false는 "아직 문자가 확인되지 않음"처럼 정상적인 재시도 상황, 에러는 진행 자체가 불가능한 상황 */
export async function confirmPhoneVerification(prisma: PrismaClient, userId: string): Promise<boolean> {
  const pending = await prisma.phoneVerificationRequest.findUnique({ where: { userId } });
  if (!pending) {
    throw new PhoneVerificationError("진행 중인 인증 요청이 없어요. 다시 시작해주세요.", 404);
  }
  if (pending.expiresAt < new Date()) {
    await prisma.phoneVerificationRequest.delete({ where: { userId } }).catch(() => {});
    throw new PhoneVerificationError("인증 시간이 만료됐어요. 다시 시작해주세요.", 410);
  }

  const withinMinutes = Math.min(60, Math.max(1, Math.ceil((pending.expiresAt.getTime() - pending.createdAt.getTime()) / 60000)));

  let exists: boolean;
  try {
    exists = await checkMessageExists(pending.phoneNumber, pending.code, withinMinutes);
  } catch (err) {
    const message = err instanceof OctomoError ? err.message : "인증 확인 중 오류가 발생했어요.";
    throw new PhoneVerificationError(message, 502);
  }
  if (!exists) return false;

  // 조회와 확정 사이 짧은 시차에 다른 유저가 같은 번호를 먼저 가져갔을 가능성까지 트랜잭션으로 막는다
  try {
    await prisma.$transaction(async (tx) => {
      const taken = await tx.user.findUnique({ where: { verifiedPhoneNumber: pending.phoneNumber } });
      if (taken && taken.id !== userId) {
        throw new Error("ALREADY_TAKEN");
      }
      await tx.user.update({
        where: { id: userId },
        data: { verifiedPhoneNumber: pending.phoneNumber, phoneVerifiedAt: new Date() },
      });
      await tx.phoneVerificationRequest.delete({ where: { userId } });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_TAKEN") {
      throw new PhoneVerificationError("이미 다른 계정에서 인증된 번호예요.", 409);
    }
    throw err;
  }

  return true;
}
