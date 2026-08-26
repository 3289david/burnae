import OpenAI from "openai";
import { reviewJavaSourceSafety } from "@/lib/ai/javaSafety";

/**
 * "AI 플러그인/모드 메이커".
 *
 * 세 가지 방식을 지원한다:
 *   - "java_plugin": 실제 컴파일되는 Bukkit/Paper 플러그인(.jar). Paper API를 링크해서 javac로
 *     직접 컴파일한다(빌드 도구 없이). 컴파일된 코드는 Modrinth에서 받은 서드파티 플러그인과
 *     동일하게 고객의 이미 격리된 Pterodactyl 컨테이너 안에서만 실행되므로, 적용 전 반드시
 *     정적 검사 + AI 안전성 검토를 통과해야 한다 (src/lib/ai/javaSafety.ts).
 *   - "skript": Skript 플러그인용 스크립트(.sk). 컴파일 불필요, 즉시 리로드.
 *   - "datapack": 순정 서버에서도 동작하는 바닐라 데이터팩.
 * java_plugin/skript는 Bukkit 계열(Paper/Purpur/Spigot) 서버에서만 의미가 있고,
 * Forge/Fabric/NeoForge/Vanilla 서버에는 datapack만 적용 가능하다.
 */

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY || "unset",
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://burnae.kr",
        "X-Title": "Burnae AI Plugin Maker",
      },
    });
  }
  return _client;
}
const MODEL = process.env.OPENROUTER_MODEL ?? "qwen/qwen3-235b-a22b-2507";

const BUKKIT_FAMILY_KEYS = new Set(["paper", "purpur", "spigot", "bukkit"]);
export function isBukkitFamilyTemplate(templateKey: string): boolean {
  return BUKKIT_FAMILY_KEYS.has(templateKey.toLowerCase());
}

export interface PluginMakerResult {
  kind: "skript" | "datapack" | "java_plugin";
  summary: string;
  warnings: string[];
  skript?: { filename: string; content: string };
  datapack?: {
    namespace: string;
    functions: { name: string; commands: string[] }[];
    runOnLoad?: string[];
    runEveryTick?: string[];
  };
  javaPlugin?: {
    packageName: string;
    className: string;
    javaSource: string;
    pluginYml: string;
  };
  safetyReview?: { safe: boolean; reasons: string[] };
}

function buildSystemPrompt(allowJavaFamily: boolean): string {
  const options = allowJavaFamily
    ? `1) "java_plugin": 실제로 컴파일되는 Bukkit/Paper 플러그인. 클래스는 반드시 org.bukkit.plugin.java.JavaPlugin을
   상속해야 하고, onEnable/onDisable을 구현해. 이벤트 처리, 커맨드, 아이템/인벤토리 조작처럼 정교한 로직에 적합.
2) "skript": Skript 플러그인용 스크립트(.sk 문법). 간단한 커맨드/이벤트 반응에 적합, 컴파일 불필요.
3) "datapack": 순정 서버에서도 동작하는 바닐라 데이터팩. 플러그인 설치가 필요 없음.`
    : `이 서버는 Forge/Fabric/NeoForge/Vanilla 계열이라 Bukkit 플러그인이나 Skript를 쓸 수 없어.
반드시 "datapack"(바닐라 데이터팩)으로만 만들어.`;

  return `너는 마인크래프트 서버용 커스텀 콘텐츠를 만드는 생성기야. 진짜 컴파일 모드(Forge/Fabric mod)는
ForgeGradle/Fabric Loom 같은 전용 빌드 체계가 필요해서 지원하지 않아 — 대신 아래 방식 중에서만 만들어:

${options}

사용자 요청을 보고 가장 적합한 방식을 네가 골라. 반드시 지정된 JSON 스키마로만 답해 (설명 텍스트 금지, JSON 객체 하나만).
위험하거나(서버/파일시스템 파괴, 외부 네트워크 접근, 무한루프, 다른 플레이어 데이터 무단 접근 등) 부적절한 요청이면
안전한 대안으로 바꿔서 만들고 warnings에 왜 바꿨는지 적어.

스키마:
{
  "kind": "java_plugin" | "skript" | "datapack",
  "summary": "무엇을 만들었는지 한국어로 1~2문장",
  "warnings": ["주의할 점이 있으면 한국어로, 없으면 빈 배열"],
  "javaPlugin": {
    "packageName": "예: com.burnae.customplugin (소문자, 점 구분)",
    "className": "예: CustomPlugin (파스칼케이스)",
    "javaSource": "JavaPlugin을 상속한 메인 클래스 전체 소스 (package 선언부터 끝까지)",
    "pluginYml": "plugin.yml 전체 내용 (name, version, main, api-version 포함)"
  },
  "skript": { "filename": "예: custom_shop.sk", "content": "실제 .sk 스크립트 전체 내용" },
  "datapack": {
    "namespace": "영문 소문자/숫자/언더스코어만, 예: custom",
    "functions": [ { "name": "함수명(영문 소문자)", "commands": ["/으로 시작하지 않는 실제 마인크래프트 명령어들"] } ],
    "runOnLoad": ["데이터팩 로드시 1회 실행할 함수명들 (선택)"],
    "runEveryTick": ["매 틱 반복 실행할 함수명들 (선택, 성능 부담 있으니 신중히)"]
  }
}
kind에 해당하는 필드만 채우고 나머지는 생략해. 서버의 마인크래프트 버전에 맞는 문법/아이템ID/명령어를 사용해.`;
}

export async function generatePluginContent(params: {
  description: string;
  minecraftVersion: string;
  templateKey: string;
}): Promise<PluginMakerResult> {
  const allowJavaFamily = isBukkitFamilyTemplate(params.templateKey);

  const res = await getClient().chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildSystemPrompt(allowJavaFamily) },
      {
        role: "user",
        content: `서버 종류: ${params.templateKey}\n마인크래프트 버전: ${params.minecraftVersion}\n요청: ${params.description}`,
      },
    ],
  });

  const raw = res.choices[0]?.message?.content;
  if (!raw) throw new Error("AI가 응답하지 않았어요. 잠시 후 다시 시도해주세요.");

  let parsed: PluginMakerResult;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI 응답을 이해하지 못했어요. 요청을 조금 더 구체적으로 설명해서 다시 시도해주세요.");
  }

  if (!["skript", "datapack", "java_plugin"].includes(parsed.kind)) {
    throw new Error("지원하지 않는 생성 방식이에요. 다시 시도해주세요.");
  }
  if (!allowJavaFamily && parsed.kind !== "datapack") {
    throw new Error("이 서버 종류에서는 데이터팩만 만들 수 있어요.");
  }
  if (parsed.kind === "skript" && !parsed.skript?.content) {
    throw new Error("스크립트 생성에 실패했어요. 다시 시도해주세요.");
  }
  if (parsed.kind === "datapack" && (!parsed.datapack?.namespace || !parsed.datapack.functions?.length)) {
    throw new Error("데이터팩 생성에 실패했어요. 다시 시도해주세요.");
  }
  if (parsed.kind === "java_plugin" && !parsed.javaPlugin?.javaSource) {
    throw new Error("플러그인 생성에 실패했어요. 다시 시도해주세요.");
  }

  let safetyReview: { safe: boolean; reasons: string[] } | undefined;
  if (parsed.kind === "java_plugin") {
    safetyReview = await reviewJavaSourceSafety(parsed.javaPlugin!.javaSource);
  }

  return { ...parsed, warnings: parsed.warnings ?? [], safetyReview };
}
