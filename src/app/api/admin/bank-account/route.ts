import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const accounts = await prisma.bankAccountSetting.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(accounts);
}

const schema = z.object({
  bankName: z.string().min(1),
  accountNumber: z.string().min(1),
  accountHolder: z.string().min(1),
});

/**
 * 고객 결제 안내 화면에 표시할 입금 계좌 정보.
 * 반드시 페이싱크 대시보드에 등록(입출금 알림 SMS 연동)한 계좌와 동일해야
 * 입금이 자동으로 매칭된다.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 422 });
  }

  const account = await prisma.$transaction(async (tx) => {
    await tx.bankAccountSetting.updateMany({ data: { active: false }, where: { active: true } });
    return tx.bankAccountSetting.create({ data: { ...parsed.data, active: true } });
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "BANK_ACCOUNT_UPDATED",
      targetType: "BankAccountSetting",
      targetId: account.id,
      metadata: { bankName: account.bankName },
    },
  });

  return NextResponse.json(account);
}
