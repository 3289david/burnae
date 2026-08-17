import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { PteroClient } from "@/lib/pterodactyl";

const schema = z.object({ directory: z.string().min(1), files: z.array(z.string()).min(1) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server || !server.pterodactylIdentifier) {
    return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  try {
    const file = await PteroClient.compressFiles(
      server.pterodactylIdentifier,
      parsed.data.directory,
      parsed.data.files,
    );
    return NextResponse.json(file);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "압축 중 오류가 발생했습니다." },
      { status: 502 },
    );
  }
}
