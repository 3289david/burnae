import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hasValidInternalSecret } from "@/lib/internalAuth";

const schema = z.object({ userId: z.string(), serverId: z.string() });

/** ssh burnae.kr 게이트웨이가 메뉴에서 "접속"을 고르면, 실제로 그 서버의 전용 SSH
 * 포트/비밀번호를 받아 그쪽으로 세션을 그대로 이어준다(고객은 포트를 몰라도 된다). */
export async function POST(request: Request) {
  if (!hasValidInternalSecret(request)) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  const server = await prisma.server.findFirst({
    where: { id: parsed.data.serverId, ownerId: parsed.data.userId, deletedAt: null },
    select: { allocationIp: true, sshPort: true, accessSecret: true },
  });
  if (!server || !server.allocationIp || !server.sshPort || !server.accessSecret) {
    return NextResponse.json({ error: "이 서버는 SSH 접속을 지원하지 않아요." }, { status: 404 });
  }

  return NextResponse.json({
    ip: server.allocationIp,
    port: server.sshPort,
    password: server.accessSecret,
  });
}
