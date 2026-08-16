import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { PteroClient } from "@/lib/pterodactyl";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const server = await authorizeServerAccess(user, id);
  if (!server) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (!server.pterodactylIdentifier) {
    return NextResponse.json({
      current_state: "offline",
      is_suspended: false,
      resources: {
        memory_bytes: 0, cpu_absolute: 0, disk_bytes: 0,
        network_rx_bytes: 0, network_tx_bytes: 0, uptime: 0,
      },
    });
  }

  const resources = await PteroClient.getServerResources(server.pterodactylIdentifier);
  return NextResponse.json(resources);
}
