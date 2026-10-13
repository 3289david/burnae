import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { confirmPhoneVerification, PhoneVerificationError } from "@/lib/phoneVerification";

/** "코드를 보냈어요" 버튼을 누르면 호출 — OCTOMO에 실제로 도착했는지 조회해서 인증을 마무리한다 */
export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  try {
    const verified = await confirmPhoneVerification(prisma, user.id);
    return NextResponse.json({ verified });
  } catch (err) {
    if (err instanceof PhoneVerificationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
