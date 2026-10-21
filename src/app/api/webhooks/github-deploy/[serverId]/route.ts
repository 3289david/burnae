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

  // 추적 중인 브랜치가 따로 있으면(server.gitBranch), 그 브랜치로 push된 게 아니면 무시한다 —
  // 안 그러면 다른 브랜치(기능 브랜치, PR 등)에 push할 때마다 불필요하게 재배포/재시작된다
  if (server.gitBranch) {
    let pushedRef: string | undefined;
    try {
      pushedRef = (JSON.parse(rawBody) as { ref?: string }).ref;
    } catch {
      // 파싱 실패하면 브랜치를 알 수 없으니 안전하게 그냥 진행한다(기존 동작 유지)
    }
    if (pushedRef && pushedRef !== `refs/heads/${server.gitBranch}`) {
      return NextResponse.json({ ok: true, ignored: `branch mismatch (${pushedRef})` });
    }
  }

  // 응답은 바로 돌려주고(GitHub는 10초 안에 응답 없으면 실패로 기록함) 배포는 비동기로 진행한다
  redeployFromGit(server, null, "WEBHOOK").catch((err) => {
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
