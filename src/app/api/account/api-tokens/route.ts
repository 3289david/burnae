import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createApiToken } from "@/lib/apiToken";
import { withApiErrorHandling } from "@/lib/apiHandler";

const MAX_TOKENS_PER_USER = 10;

export const GET = withApiErrorHandling(async () => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const tokens = await prisma.apiToken.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true },
  });
  return NextResponse.json(tokens);
});

const schema = z.object({ name: z.string().trim().min(1).max(60) });

export const POST = withApiErrorHandling(async (request: Request) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "토큰 이름을 입력해주세요." }, { status: 422 });

  const count = await prisma.apiToken.count({ where: { userId: user.id } });
  if (count >= MAX_TOKENS_PER_USER) {
    return NextResponse.json({ error: `토큰은 계정당 최대 ${MAX_TOKENS_PER_USER}개까지 만들 수 있어요.` }, { status: 409 });
  }

  const { id, token } = await createApiToken(user.id, parsed.data.name);
  return NextResponse.json({ id, token });
});
