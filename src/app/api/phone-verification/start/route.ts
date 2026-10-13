import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { isValidKoreanMobileNumber, OCTOMO_TARGET_NUMBER } from "@/lib/octomo";

const VERIFICATION_TTL_MINUTES = 10;

const schema = z.object({ phoneNumber: z.string() });

/** 인증 코드를 발급하고 "이 코드를 1666-3538로 보내주세요"를 안내하기 위한 정보를 돌려준다 */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  if (user.verifiedPhoneNumber) {
    return NextResponse.json({ error: "이미 휴대폰 인증이 완료된 계정이에요." }, { status: 409 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isValidKoreanMobileNumber(parsed.data.phoneNumber)) {
    return NextResponse.json({ error: "휴대폰 번호는 010으로 시작하는 11자리 숫자여야 해요." }, { status: 422 });
  }
  const phoneNumber = parsed.data.phoneNumber;

  const existingOwner = await prisma.user.findUnique({ where: { verifiedPhoneNumber: phoneNumber } });
  if (existingOwner) {
    return NextResponse.json({ error: "이미 다른 계정에서 인증된 번호예요." }, { status: 409 });
  }

  // 6자리 숫자 코드 — 너무 짧으면 다른 사람이 아무 문자나 보내서 우연히 통과할 수 있어서 적당히 길게
  const code = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MINUTES * 60 * 1000);

  await prisma.phoneVerificationRequest.upsert({
    where: { userId: user.id },
    update: { phoneNumber, code, createdAt: new Date(), expiresAt },
    create: { userId: user.id, phoneNumber, code, expiresAt },
  });

  return NextResponse.json({
    code,
    targetNumber: OCTOMO_TARGET_NUMBER,
    expiresInMinutes: VERIFICATION_TTL_MINUTES,
  });
}
