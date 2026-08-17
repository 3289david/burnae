import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { PteroClient } from "@/lib/pterodactyl";

export async function GET(
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

  const file = new URL(request.url).searchParams.get("file");
  if (!file) return NextResponse.json({ error: "file 파라미터가 필요합니다." }, { status: 422 });

  const url = await PteroClient.getDownloadUrl(server.pterodactylIdentifier, file);
  return NextResponse.json({ url });
}
