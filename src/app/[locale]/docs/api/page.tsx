import { Link } from "@/i18n/navigation";
import BrandMark from "@/components/BrandMark";
import Footer from "@/components/Footer";

export const metadata = { title: "API 문서 — Burnae" };

const ENDPOINTS: { method: string; path: string; desc: string; body?: string; sample: string }[] = [
  {
    method: "GET",
    path: "/api/v1/servers",
    desc: "내가 접근할 수 있는 서버 목록(소유 서버 + 팀 멤버로 속한 서버)",
    sample: `[
  {
    "id": "cl123...",
    "name": "my-bot",
    "status": "RUNNING",
    "category": "DISCORD_BOT",
    "templateKey": "nodejs-bot",
    "address": "my-bot",
    "ramMb": 1024,
    "cpuPercent": 50,
    "diskMb": 20480,
    "isOwner": true
  }
]`,
  },
  {
    method: "GET",
    path: "/api/v1/servers/{id}",
    desc: "서버 하나의 상세 정보",
    sample: `{
  "id": "cl123...",
  "name": "my-bot",
  "status": "RUNNING",
  "address": "my-bot",
  "ramMb": 1024,
  "cpuPercent": 50,
  "diskMb": 20480,
  "isOwner": true,
  "createdAt": "2026-01-01T00:00:00.000Z"
}`,
  },
  {
    method: "POST",
    path: "/api/v1/servers/{id}/power",
    desc: "전원 조작 (MODERATOR 이상 권한 필요)",
    body: `{ "signal": "start" | "stop" | "restart" | "kill" }`,
    sample: `{ "ok": true }`,
  },
  {
    method: "POST",
    path: "/api/v1/servers/{id}/deploy",
    desc: "Git 저장소에서 수동 배포 트리거 (DEVELOPER 이상 권한 필요, Git 배포를 지원하는 서버만)",
    sample: `{ "ok": true, "output": "Already up to date.\\n..." }`,
  },
  {
    method: "GET",
    path: "/api/v1/servers/{id}/usage",
    desc: "최근 CPU/RAM/디스크 사용량 스냅샷과 플랜 한도 (10분 간격으로 갱신)",
    sample: `{
  "recordedAt": "2026-10-20T09:40:00.000Z",
  "cpu": { "usedPercent": 34.2, "limitPercent": 100 },
  "ram": { "usedMb": 612, "limitMb": 1024 },
  "disk": { "usedMb": 2048, "limitMb": 20480 }
}`,
  },
];

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <Link href="/" className="inline-flex items-center gap-2 text-lg font-bold font-display">
            <BrandMark size={22} /> Burnae
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 flex-1 w-full">
        <h1 className="text-3xl font-bold font-display">API 문서</h1>
        <p className="text-sm text-text-dim mt-2">
          CLI나 스크립트에서 내 서버를 조회하고 조작할 수 있는 공개 API예요. Render/Railway의 API와
          비슷한 역할이에요.
        </p>

        <section className="mt-8">
          <h2 className="text-lg font-semibold font-display">인증</h2>
          <p className="text-sm text-text-dim mt-2">
            <Link href="/dashboard/account" className="text-accent hover:underline">
              계정 설정
            </Link>
            에서 개인 API 토큰을 발급한 뒤, 모든 요청에 <code className="font-mono text-xs bg-surface-2 px-1 py-0.5 rounded">Authorization</code>{" "}
            헤더로 보내주세요. 토큰은 발급 시 한 번만 보여지고, 그 뒤로는 다시 조회할 수 없어요(분실하면 새로
            발급해서 기존 걸 삭제하세요).
          </p>
          <pre className="mt-3 text-xs font-mono bg-surface-2 rounded-lg px-3 py-2.5 overflow-x-auto">
{`Authorization: Bearer burn_xxxxxxxxxxxxxxxxxxxxxxxxxxxx`}
          </pre>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold font-display">기본 주소</h2>
          <pre className="mt-2 text-xs font-mono bg-surface-2 rounded-lg px-3 py-2.5 overflow-x-auto">
            https://burnae.kr/api/v1
          </pre>
        </section>

        <section className="mt-8 space-y-8">
          <h2 className="text-lg font-semibold font-display">엔드포인트</h2>
          {ENDPOINTS.map((ep) => (
            <div key={ep.method + ep.path} className="border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-semibold bg-accent/15 text-accent px-2 py-0.5 rounded">
                  {ep.method}
                </span>
                <code className="text-sm font-mono">{ep.path}</code>
              </div>
              <p className="text-sm text-text-dim mt-2">{ep.desc}</p>
              {ep.body && (
                <>
                  <p className="text-xs text-text-dim mt-3 mb-1">요청 본문</p>
                  <pre className="text-xs font-mono bg-surface-2 rounded-lg px-3 py-2.5 overflow-x-auto">{ep.body}</pre>
                </>
              )}
              <p className="text-xs text-text-dim mt-3 mb-1">응답 예시</p>
              <pre className="text-xs font-mono bg-surface-2 rounded-lg px-3 py-2.5 overflow-x-auto whitespace-pre-wrap">
                {ep.sample}
              </pre>
            </div>
          ))}
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold font-display">curl 예시</h2>
          <pre className="mt-2 text-xs font-mono bg-surface-2 rounded-lg px-3 py-2.5 overflow-x-auto">
{`curl -H "Authorization: Bearer burn_xxxx" \\
  https://burnae.kr/api/v1/servers

curl -X POST -H "Authorization: Bearer burn_xxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"signal":"restart"}' \\
  https://burnae.kr/api/v1/servers/SERVER_ID/power`}
          </pre>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold font-display">CLI</h2>
          <p className="text-sm text-text-dim mt-2">
            공식 CLI는 아직 없지만, 아래 스크립트를 <code className="font-mono text-xs bg-surface-2 px-1 py-0.5 rounded">burnae</code>{" "}
            로 저장하고 <code className="font-mono text-xs bg-surface-2 px-1 py-0.5 rounded">chmod +x burnae</code> 하면 바로 커맨드처럼 쓸 수 있어요.
          </p>
          <pre className="mt-3 text-xs font-mono bg-surface-2 rounded-lg px-3 py-2.5 overflow-x-auto whitespace-pre">
{`#!/bin/bash
# burnae CLI — 사용법: BURNAE_TOKEN=burn_xxxx ./burnae <list|get|power|deploy|usage> [server_id] [arg]
set -e
API="https://burnae.kr/api/v1"
AUTH="Authorization: Bearer $BURNAE_TOKEN"
case "$1" in
  list) curl -s -H "$AUTH" "$API/servers" | python3 -m json.tool ;;
  get) curl -s -H "$AUTH" "$API/servers/$2" | python3 -m json.tool ;;
  usage) curl -s -H "$AUTH" "$API/servers/$2/usage" | python3 -m json.tool ;;
  power) curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \\
    -d "{\\"signal\\":\\"$3\\"}" "$API/servers/$2/power" ;;
  deploy) curl -s -X POST -H "$AUTH" "$API/servers/$2/deploy" | python3 -m json.tool ;;
  *) echo "usage: burnae <list|get|usage|power|deploy> [server_id] [arg]"; exit 1 ;;
esac`}
          </pre>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold font-display">오류 응답</h2>
          <p className="text-sm text-text-dim mt-2">
            모든 오류는 <code className="font-mono text-xs bg-surface-2 px-1 py-0.5 rounded">{`{ "error": "..." }`}</code> 형태의
            JSON과 적절한 HTTP 상태 코드(401 인증 실패, 403 권한 없음, 404 없음, 409 처리할 수 없는 상태,
            422 잘못된 입력)로 내려가요.
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}
