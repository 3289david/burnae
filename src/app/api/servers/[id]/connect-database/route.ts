import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess, getServerRole, hasServerRank } from "@/lib/serverAccess";
import { prisma } from "@/lib/prisma";
import { withApiErrorHandling } from "@/lib/apiHandler";
import { PteroClient } from "@/lib/pterodactyl";
import { buildConnectionString, databaseTemplateKeys } from "@/lib/databaseConnect";

/** 내가 가진 DB 서버(Postgres/MongoDB/Redis) 목록 + 각각의 연결 문자열 — "서비스 연결" 드롭다운용.
 * Railway/Render의 "Connect" 기능과 같은 개념: 같은 계정의 다른 서버를 골라서 접속 정보를 바로 받는다 */
export const GET = withApiErrorHandling(async (_request: Request) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const dbServers = await prisma.server.findMany({
    where: { ownerId: user.id, deletedAt: null, template: { key: { in: databaseTemplateKeys() } } },
    include: { template: true },
  });

  const options = dbServers
    .map((s) => ({ id: s.id, name: s.name, connectionString: buildConnectionString(s, s.template) }))
    .filter((o): o is { id: string; name: string; connectionString: string } => o.connectionString !== null);

  return NextResponse.json({ databases: options });
});

const schema = z.object({
  databaseServerId: z.string().min(1),
  envVarName: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Z][A-Z0-9_]*$/, "대문자/숫자/언더스코어만 쓸 수 있어요(예: DATABASE_URL)"),
});

/** 고른 DB 서버의 연결 문자열을 대상 서버의 /home/container/.env 파일에 써준다(이미 있으면 그
 * 키만 교체, 없으면 새로 만든다) — 코드가 직접 Pterodactyl 변수를 읽는 게 아니라 .env/dotenv로
 * 읽는 흔한 방식에 맞춘 것. 일반 서버(블랭크 서버 등)는 egg 변수 체계가 없어서 이 방식이 유일하게 통한다 */
export const POST = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (!hasServerRank(await getServerRole(user, server), "DEVELOPER")) {
    return NextResponse.json({ error: "연결할 권한이 없어요." }, { status: 403 });
  }
  if (!server.pterodactylIdentifier) {
    return NextResponse.json({ error: "서버가 아직 준비 중이에요." }, { status: 422 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "잘못된 요청입니다." }, { status: 422 });

  const dbServer = await prisma.server.findUnique({
    where: { id: parsed.data.databaseServerId },
    include: { template: true },
  });
  if (!dbServer || dbServer.ownerId !== user.id) {
    return NextResponse.json({ error: "데이터베이스 서버를 찾을 수 없습니다." }, { status: 404 });
  }
  const connectionString = buildConnectionString(dbServer, dbServer.template);
  if (!connectionString) {
    return NextResponse.json({ error: "이 서버의 접속 정보를 아직 만들 수 없어요." }, { status: 422 });
  }

  let existingEnv = "";
  try {
    existingEnv = await PteroClient.readFile(server.pterodactylIdentifier, ".env");
  } catch {
    // 파일이 없으면(첫 연결) 빈 내용에서 새로 시작
  }

  const lines = existingEnv.split("\n").filter((line) => line.trim().length > 0);
  const keyPrefix = `${parsed.data.envVarName}=`;
  const filtered = lines.filter((line) => !line.startsWith(keyPrefix));
  filtered.push(`${keyPrefix}${connectionString}`);

  await PteroClient.writeFile(server.pterodactylIdentifier, ".env", filtered.join("\n") + "\n");

  return NextResponse.json({ ok: true, envVarName: parsed.data.envVarName, connectionString });
});
