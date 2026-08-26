import OpenAI from "openai";

/**
 * 컴파일된 자바 플러그인은 고객의 실제 서버에서 실행되므로, 컴파일 전에 2중으로 검사한다:
 *   1) 정적 키워드 차단 목록 — 명백히 위험한 API 호출을 빠르고 확실하게 차단
 *   2) AI 의미 분석 — 키워드만으로는 못 잡는 맥락적 위험(예: 다른 플레이어 인벤토리 무단 조작,
 *      과도한 리소스 소모 로직 등)을 프롬프트로 검토
 * 둘 중 하나라도 위험하다고 판단하면 적용을 막는다.
 */

const BLOCKED_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /Runtime\s*\.\s*getRuntime\s*\(\s*\)\s*\.\s*exec/, reason: "외부 프로세스 실행(Runtime.exec)" },
  { pattern: /new\s+ProcessBuilder/, reason: "외부 프로세스 실행(ProcessBuilder)" },
  { pattern: /System\s*\.\s*exit/, reason: "JVM 강제 종료(System.exit) — 서버 전체가 죽음" },
  { pattern: /\.setAccessible\s*\(\s*true\s*\)/, reason: "리플렉션으로 접근 제한 우회" },
  { pattern: /java\.net\.(Socket|ServerSocket|URLConnection|HttpURLConnection)/, reason: "임의 네트워크 연결" },
  { pattern: /new\s+URL\s*\(/, reason: "임의 URL 접근" },
  { pattern: /File\s*\.\s*listRoots|System\s*\.\s*getenv/, reason: "시스템 정보/파일시스템 전체 접근" },
  { pattern: /\brm\s+-rf\b|deleteRecursively|Files\s*\.\s*walk.*delete/i, reason: "대량 파일 삭제 패턴" },
  { pattern: /ClassLoader|defineClass|MethodHandles\.Lookup/, reason: "동적 클래스 로딩/바이트코드 조작" },
];

export function scanForBlockedPatterns(javaSource: string): string[] {
  const found: string[] = [];
  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(javaSource)) found.push(reason);
  }
  return found;
}

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY || "unset",
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://burnae.kr",
        "X-Title": "Burnae AI Plugin Safety Review",
      },
    });
  }
  return _client;
}
const MODEL = process.env.OPENROUTER_MODEL ?? "qwen/qwen3-235b-a22b-2507";

const REVIEW_SYSTEM_PROMPT = `너는 마인크래프트 플러그인 자바 코드의 보안 검토자야. 아래 코드가 실제 고객 서버에
설치되기 전에 위험한지 검사해. 다음을 위험으로 판단해:
- 파일시스템을 서버 데이터 폴더 밖까지 읽거나 지우는 코드
- 외부 네트워크로 데이터를 보내거나 외부 코드를 받아오는 코드
- 서버를 강제 종료하거나 무한 루프/과도한 리소스를 쓰는 코드
- 다른 플레이어의 데이터(인벤토리, 계정 등)를 정당한 게임플레이 이유 없이 몰래 조작/유출하는 코드
- 리플렉션이나 클래스 로딩으로 접근 제어를 우회하는 코드
일반적인 플러그인 로직(아이템 지급, 이벤트 처리, 커맨드, 인게임 메시지 등)은 안전으로 판단해.
반드시 JSON만 답해: {"safe": boolean, "reasons": string[]}`;

export async function reviewJavaSourceSafety(javaSource: string): Promise<{ safe: boolean; reasons: string[] }> {
  const blocked = scanForBlockedPatterns(javaSource);
  if (blocked.length > 0) {
    return { safe: false, reasons: blocked };
  }

  try {
    const res = await getClient().chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: REVIEW_SYSTEM_PROMPT },
        { role: "user", content: javaSource },
      ],
    });
    const raw = res.choices[0]?.message?.content;
    if (!raw) return { safe: false, reasons: ["안전성 검사 응답을 받지 못했어요."] };
    const parsed = JSON.parse(raw) as { safe?: boolean; reasons?: string[] };
    return { safe: parsed.safe === true, reasons: parsed.reasons ?? [] };
  } catch {
    // 검사 자체가 실패하면 안전하지 않다고 간주 — 확인 안 된 코드를 통과시키지 않는다
    return { safe: false, reasons: ["안전성 검사를 완료하지 못했어요. 다시 시도해주세요."] };
  }
}
