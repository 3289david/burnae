import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redeployFromGit } from "@/lib/deploy";

/**
 * GitHub가 push할 때 호출하는 웹훅 — 서버별로 발급한 비밀값(X-Hub-Signature-256)으로만
 * 인증하고 로그인 세션은 필요 없다(GitHub 서버가 직접 부르는 외부 진입점이라서). 서명이
 * 안 맞으면 아무것도 안 하고 바로 거절한다 — 웹훅 위조/재사용을 막는 유일한 방어선이다.
 */
export async function POST(request: Request, { params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = await params;
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server || !server.autoDeployEnabled || !server.deployWebhookSecret) {
    // 설정이 없는 서버에 대한 요청의 존재 자체를 알려주지 않는다(스캐닝 방지)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const signatureHeader = request.headers.get("x-hub-signature-256");
  const rawBody = await request.text();
  if (!signatureHeader || !verifyGithubSignature(rawBody, signatureHeader, server.deployWebhookSecret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const event = request.headers.get("x-github-event");
  if (event === "ping") return NextResponse.json({ ok: true, pong: true });
  if (event !== "push") return NextResponse.json({ ok: true, ignored: event });

  // 응답은 바로 돌려주고(GitHub는 10초 안에 응답 없으면 실패로 기록함) 배포는 비동기로 진행한다
  redeployFromGit(server, null).catch((err) => {
    console.error(`[github-deploy] 서버 ${server.id} 배포 실패:`, err);
  });

  return NextResponse.json({ ok: true, deploying: true });
}

function verifyGithubSignature(rawBody: string, header: string, secret: string): boolean {
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
