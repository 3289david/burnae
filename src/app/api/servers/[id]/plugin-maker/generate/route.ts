import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { generatePluginContent } from "@/lib/ai/pluginMaker";

const schema = z.object({ description: z.string().min(3).max(500) });

/** 미리보기 생성만 한다 — 서버에는 아무 것도 쓰지 않는다. 실제 적용은 /apply에서 사용자가 확인 후 진행 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "무엇을 만들지 조금 더 자세히 설명해주세요." }, { status: 422 });
  }

  const template = await prisma.serverTemplate.findUniqueOrThrow({ where: { id: server.templateId } });

  try {
    const result = await generatePluginContent({
      description: parsed.data.description,
      minecraftVersion: server.minecraftVersion,
      templateKey: template.key,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "생성에 실패했어요.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
