import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const CODE_TTL_MINUTES = 5;

/** 혼동되기 쉬운 문자(0/O, 1/I/l) 없이 6자 코드를 만든다 — 터미널에 그대로 타이핑해야 하니까 */
function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[crypto.randomInt(chars.length)];
  return code;
}

/** ssh burnae.kr 게이트웨이 로그인용 1회용 코드를 발급한다 — 비밀번호 자리에 이 코드를
 * 그대로 입력하면 로그인된다. 계정당 SSH 키 체계가 없어서 코드 방식으로 대신한다. */
export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  // 이전에 발급했던(아직 안 쓴) 코드는 새로 발급하면서 정리한다 — 여러 개가 동시에 살아있을
  // 필요가 없고, 화면에 "코드 하나만" 보여주는 게 혼동이 없다
  await prisma.sshGatewayCode.deleteMany({ where: { userId: user.id, usedAt: null } });

  let code = randomCode();
  // 극히 낮은 확률로 다른 유저와 코드가 겹칠 수 있다 — unique 제약 위반 시 한 번 더 뽑는다
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await prisma.sshGatewayCode.findUnique({ where: { code } });
    if (!existing) break;
    code = randomCode();
  }

  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);
  await prisma.sshGatewayCode.create({ data: { code, userId: user.id, expiresAt } });

  return NextResponse.json({ code, expiresAt });
}
