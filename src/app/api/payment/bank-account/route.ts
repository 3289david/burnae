import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const account = await prisma.bankAccountSetting.findFirst({ where: { active: true } });
  if (!account) {
    return NextResponse.json({ error: "입금 계좌가 아직 설정되지 않았습니다." }, { status: 404 });
  }
  return NextResponse.json({
    bankName: account.bankName,
    accountNumber: account.accountNumber,
    accountHolder: account.accountHolder,
  });
}
