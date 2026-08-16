import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-xl font-bold">🔥 Burnae</span>
          <nav className="flex items-center gap-3 text-sm">
            {user ? (
              <Link href="/dashboard" className="btn-primary px-4 py-2">
                대시보드
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-text-dim hover:text-text px-3 py-2">
                  로그인
                </Link>
                <Link href="/register" className="btn-primary px-4 py-2">
                  시작하기
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
            마인크래프트 서버,
            <br />
            <span className="text-accent">어렵게 만들지 마세요.</span>
          </h1>
          <p className="mt-6 text-lg text-text-dim">
            1분 안에 서버를 만들고, 말로 관리하세요. 설정도, 플러그인도, 오류 해결도
            채팅으로 끝냅니다.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href="/register" className="btn-primary px-6 py-3 text-base">
              서버 만들기
            </Link>
            <Link href="#features" className="btn-secondary px-6 py-3 text-base">
              더 알아보기
            </Link>
          </div>
        </section>

        <section id="features" className="max-w-5xl mx-auto px-6 pb-24 grid sm:grid-cols-3 gap-4">
          {[
            { icon: "⚡", title: "1분 서버 생성", desc: "결제 즉시 자동으로 서버가 만들어져요." },
            { icon: "🤖", title: "AI 서버 관리", desc: "\"커맨드 블럭 켜줘\" 라고 말하면 끝." },
            { icon: "🛡️", title: "자동 백업", desc: "위험한 작업 전엔 자동으로 백업해요." },
          ].map((f) => (
            <div key={f.title} className="card p-6">
              <div className="text-3xl">{f.icon}</div>
              <div className="mt-3 font-semibold">{f.title}</div>
              <div className="mt-1 text-sm text-text-dim">{f.desc}</div>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-sm text-text-dim">
        © {new Date().getFullYear()} Burnae. burnae.kr
      </footer>
    </div>
  );
}
