import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { PteroApp } from "@/lib/pterodactyl";

/**
 * 관리자가 Nest ID/Egg ID 숫자를 몰라도 이름만 보고 고를 수 있게, 연결된 Pterodactyl 패널에서
 * 실제 Nest/Egg 목록을 그대로 가져온다. (초보자용 서버 종류 등록 화면에서 사용)
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  try {
    const nests = await PteroApp.listNests();
    const withEggs = await Promise.all(
      nests.map(async (nest) => ({
        id: nest.id,
        name: nest.name,
        eggs: await PteroApp.listEggs(nest.id).then((eggs) =>
          eggs.map((e) => ({ id: e.id, name: e.name })),
        ),
      })),
    );
    return NextResponse.json(withEggs);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pterodactyl 연결 실패";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
