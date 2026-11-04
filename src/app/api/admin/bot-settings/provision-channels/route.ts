import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/auth";
import { provisionMissingChannels } from "@/lib/discordChannelProvisioning";
import { syncRulesMessage, syncLinktreeMessage } from "@/lib/discordBoards";

export async function POST() {
  const admin = await requireAdminRole(["GENERAL", "SUPER"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const result = await provisionMissingChannels();

  if (result.created.length > 0) {
    await Promise.allSettled([syncRulesMessage(), syncLinktreeMessage()]);
  }

  return NextResponse.json(result);
}
