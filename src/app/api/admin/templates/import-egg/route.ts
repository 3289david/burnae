import { NextResponse } from "next/server";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const execFileAsync = promisify(execFile);

const schema = z.object({
  eggJsonUrl: z.string().url().optional(),
  eggJson: z.unknown().optional(),
  nestId: z.number().int(),
  key: z.string().trim().min(1).max(60),
  displayName: z.string().trim().min(1).max(80).optional(),
  category: z.enum(["MINECRAFT", "DISCORD_BOT", "GENERAL"]),
  sortOrder: z.number().int().optional(),
});

const RESULT_START = "__BURNAE_EGG_IMPORT_START__";
const RESULT_END = "__BURNAE_EGG_IMPORT_END__";

// PteroApp/PteroClient가 아니라 Pterodactyl 패널(Laravel) 자체의 EggImporterService를 그대로
// 재사용한다 — 관리자가 이 세션 내내 tinker로 손수 하던 작업(egg JSON → EggImporterService::handle
// → 변수 조회)을 그대로 코드화한 것. Application API에는 egg "가져오기" 엔드포인트가 없어서
// 패널 서버(같은 박스, /var/www/pterodactyl)에서 직접 tinker를 실행하는 방식만 가능하다.
const TINKER_SCRIPT = `
$path = getenv('BURNAE_EGG_IMPORT_FILE');
$nestId = (int) getenv('BURNAE_EGG_IMPORT_NEST_ID');
$service = app(\\Pterodactyl\\Services\\Eggs\\Sharing\\EggImporterService::class);
$file = new \\Illuminate\\Http\\UploadedFile($path, basename($path), 'application/json', null, true);
$egg = $service->handle($file, $nestId);
$egg = \\Pterodactyl\\Models\\Egg::with('variables')->findOrFail($egg->id);
$env = [];
foreach ($egg->variables as $v) {
    $env[$v->env_variable] = $v->default_value;
}
echo "${RESULT_START}";
echo json_encode([
    'eggId' => $egg->id,
    'name' => $egg->name,
    'dockerImages' => $egg->docker_images,
    'startup' => $egg->startup,
    'defaultEnvironment' => $env,
]);
echo "${RESULT_END}";
`;

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." }, { status: 422 });
  }
  const input = parsed.data;

  const existing = await prisma.serverTemplate.findUnique({ where: { key: input.key } });
  if (existing) {
    return NextResponse.json({ error: `key "${input.key}"는 이미 사용 중이에요.` }, { status: 409 });
  }

  let eggJson: unknown;
  if (input.eggJson) {
    eggJson = input.eggJson;
  } else if (input.eggJsonUrl) {
    const res = await fetch(input.eggJsonUrl).catch(() => null);
    if (!res || !res.ok) return NextResponse.json({ error: "egg JSON을 가져오지 못했어요." }, { status: 422 });
    eggJson = await res.json().catch(() => null);
    if (!eggJson) return NextResponse.json({ error: "올바른 JSON이 아니에요." }, { status: 422 });
  } else {
    return NextResponse.json({ error: "eggJson 또는 eggJsonUrl 중 하나가 필요해요." }, { status: 422 });
  }

  const tmpFile = path.join(os.tmpdir(), `burnae-egg-import-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  await fs.writeFile(tmpFile, JSON.stringify(eggJson));

  let result: { eggId: number; name: string; dockerImages: Record<string, string>; startup: string; defaultEnvironment: Record<string, string> };
  try {
    const { stdout } = await execFileAsync("php", ["artisan", "tinker", "--execute", TINKER_SCRIPT], {
      cwd: "/var/www/pterodactyl",
      env: {
        ...process.env,
        BURNAE_EGG_IMPORT_FILE: tmpFile,
        BURNAE_EGG_IMPORT_NEST_ID: String(input.nestId),
      },
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const start = stdout.indexOf(RESULT_START);
    const end = stdout.indexOf(RESULT_END);
    if (start === -1 || end === -1) {
      return NextResponse.json({ error: `가져오기 실패: ${stdout.slice(0, 500)}` }, { status: 500 });
    }
    result = JSON.parse(stdout.slice(start + RESULT_START.length, end));
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: `가져오기 실패: ${message.slice(0, 500)}` }, { status: 500 });
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }

  const dockerImages = result.dockerImages ?? {};
  const dockerImageValues = Object.values(dockerImages);
  const dockerImage = dockerImageValues[0] ?? "";
  if (!dockerImage) {
    return NextResponse.json({ error: "이 egg에 도커 이미지가 없어요." }, { status: 422 });
  }

  const template = await prisma.serverTemplate.create({
    data: {
      key: input.key,
      displayName: input.displayName || result.name,
      category: input.category,
      pterodactylNestId: input.nestId,
      pterodactylEggId: result.eggId,
      dockerImage,
      startupCommand: result.startup,
      minecraftVersions: [],
      availableDockerImages: dockerImageValues.length > 1 ? dockerImages : undefined,
      defaultEnvironment: result.defaultEnvironment,
      sortOrder: input.sortOrder ?? 0,
    },
  });

  return NextResponse.json(template, { status: 201 });
}
