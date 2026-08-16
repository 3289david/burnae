import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 문자 제외
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/** 대시보드에서 "디스코드 연동" 버튼을 누르면 발급되는 1회용 코드 (10분 유효) */
export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const existingLink = await prisma.discordLink.findUnique({ where: { userId: user.id } });
  if (existingLink) {
    return NextResponse.json(
      { error: "이미 디스코드 계정이 연동되어 있습니다." },
      { status: 409 },
    );
  }

  await prisma.discordLinkCode.deleteMany({ where: { userId: user.id } });
  const code = await prisma.discordLinkCode.create({
    data: {
      userId: user.id,
      code: randomCode(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  return NextResponse.json({ code: code.code, expiresAt: code.expiresAt });
}
