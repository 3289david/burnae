import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withApiErrorHandling } from "@/lib/apiHandler";

export const DELETE = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ tokenId: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { tokenId } = await params;
  const token = await prisma.apiToken.findUnique({ where: { id: tokenId } });
  if (!token || token.userId !== user.id) {
    return NextResponse.json({ error: "토큰을 찾을 수 없습니다." }, { status: 404 });
  }

  await prisma.apiToken.delete({ where: { id: tokenId } });
  return NextResponse.json({ ok: true });
});
