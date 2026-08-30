import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";

const schema = z.object({ serverId: z.string(), kind: z.enum(["CHAT", "MAKER"]).default("CHAT") });

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청" }, { status: 422 });

  const server = await authorizeServerAccess(user, parsed.data.serverId);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });

  const conversation = await prisma.aiConversation.create({
    data: {
      userId: user.id,
      serverId: server.id,
      kind: parsed.data.kind,
      title: parsed.data.kind === "MAKER" ? `${server.name} 메이커` : `${server.name} 대화`,
    },
  });
  return NextResponse.json(conversation);
}

export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const serverId = params.get("serverId");
  const kindParam = params.get("kind");
  const kind = kindParam === "MAKER" ? "MAKER" : kindParam === "CHAT" ? "CHAT" : undefined;
  const conversations = await prisma.aiConversation.findMany({
    where: { userId: user.id, ...(serverId ? { serverId } : {}), ...(kind ? { kind } : {}) },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });
  return NextResponse.json(conversations);
}
