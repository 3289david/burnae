import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { generateTotpSecret, totpUri } from "@/lib/totp";
import { withApiErrorHandling } from "@/lib/apiHandler";

/** 2FA 등록 시작 — 새 비밀키를 만들어 저장(아직 활성화 안 됨)하고 QR코드를 돌려준다 */
export const POST = withApiErrorHandling(async () => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (user.twoFactorEnabled) {
    return NextResponse.json({ error: "이미 2단계 인증이 켜져 있어요." }, { status: 409 });
  }

  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: secret } });

  const uri = totpUri(secret, user.email);
  const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });

  return NextResponse.json({ secret, uri, qrDataUrl });
});
