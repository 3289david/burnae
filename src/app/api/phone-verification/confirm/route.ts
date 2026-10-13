import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { checkMessageExists, OctomoError } from "@/lib/octomo";

/** "코드를 보냈어요" 버튼을 누르면 호출 — OCTOMO에 실제로 도착했는지 조회해서 인증을 마무리한다 */
export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const pending = await prisma.phoneVerificationRequest.findUnique({ where: { userId: user.id } });
  if (!pending) {
    return NextResponse.json({ error: "진행 중인 인증 요청이 없어요. 다시 시작해주세요." }, { status: 404 });
  }
  if (pending.expiresAt < new Date()) {
    await prisma.phoneVerificationRequest.delete({ where: { userId: user.id } }).catch(() => {});
    return NextResponse.json({ error: "인증 시간이 만료됐어요. 다시 시작해주세요." }, { status: 410 });
  }

  const withinMinutes = Math.min(60, Math.max(1, Math.ceil((pending.expiresAt.getTime() - pending.createdAt.getTime()) / 60000)));

  let exists: boolean;
  try {
    exists = await checkMessageExists(pending.phoneNumber, pending.code, withinMinutes);
  } catch (err) {
    const message = err instanceof OctomoError ? err.message : "인증 확인 중 오류가 발생했어요.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (!exists) {
    return NextResponse.json({ verified: false });
  }

  // 조회와 확정 사이 짧은 시차에 다른 유저가 같은 번호를 먼저 가져갔을 가능성까지 트랜잭션으로 막는다
  try {
    await prisma.$transaction(async (tx) => {
      const taken = await tx.user.findUnique({ where: { verifiedPhoneNumber: pending.phoneNumber } });
      if (taken && taken.id !== user.id) {
        throw new Error("ALREADY_TAKEN");
      }
      await tx.user.update({
        where: { id: user.id },
        data: { verifiedPhoneNumber: pending.phoneNumber, phoneVerifiedAt: new Date() },
      });
      await tx.phoneVerificationRequest.delete({ where: { userId: user.id } });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_TAKEN") {
      return NextResponse.json({ error: "이미 다른 계정에서 인증된 번호예요." }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({ verified: true });
}
