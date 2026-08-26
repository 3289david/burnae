import OpenAI from "openai";

/**
 * 컴파일된 자바 플러그인은 고객의 실제 서버에서 실행되므로, 컴파일 전에 AI가 코드를 읽고
 * 위험한 의도가 있는지 검토한다. (generate 시점 + apply 직전, 두 번 검사 — 클라이언트가
 * 왕복시키는 값은 변조될 수 있으므로 적용 직전 재검증이 항상 최종 판단이다.)
 */

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
