import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startPhoneVerification, PhoneVerificationError } from "@/lib/phoneVerification";

const schema = z.object({ phoneNumber: z.string() });

/** 인증 코드를 발급하고 "이 코드를 1666-3538로 보내주세요"를 안내하기 위한 정보를 돌려준다 */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "요청 형식이 올바르지 않아요." }, { status: 422 });

  try {
    const result = await startPhoneVerification(prisma, user.id, parsed.data.phoneNumber);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PhoneVerificationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
