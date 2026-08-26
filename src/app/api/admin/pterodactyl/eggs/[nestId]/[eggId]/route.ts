import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { PteroApp } from "@/lib/pterodactyl";
import { matchEggPreset } from "@/lib/minecraftEggPresets";

/**
 * 관리자가 서버 종류를 등록할 때 도커 이미지(=자바 버전)/시작 명령어/환경변수 기본값을
 * 손으로 입력하지 않아도 되도록, 선택한 Egg의 실제 설정을 그대로 가져와서 미리 채워준다.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ nestId: string; eggId: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { nestId, eggId } = await params;
  try {
    const egg = await PteroApp.getEgg(Number(nestId), Number(eggId));
    const variables = egg.relationships?.variables?.data ?? [];
    const defaultEnvironment: Record<string, string> = {};
    for (const v of variables) {
      defaultEnvironment[v.attributes.env_variable] = v.attributes.default_value;
    }

    const preset = matchEggPreset(egg.name);

    return NextResponse.json({
      name: egg.name,
      startup: egg.startup,
      dockerImages: egg.docker_images, // { "자바 21 버전": "ghcr.io/...", ... } — 라벨 그대로 "자바 버전 선택"에 씀
      defaultEnvironment,
      suggestedKey: preset?.key ?? egg.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
      suggestedMinecraftVersions: preset?.minecraftVersions ?? ["latest"],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pterodactyl 연결 실패";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
