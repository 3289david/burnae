import Link from "next/link";
import {
  Zap, Bot, Terminal, Users, Puzzle, ShieldCheck, Globe, RefreshCw,
  ArrowRight, Check, MessageCircle, Rocket, Gift,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import BrandMark from "@/components/BrandMark";
import Footer from "@/components/Footer";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import ThemeToggle from "@/components/ThemeToggle";
import DotGrid from "@/components/DotGrid";

const FEATURES = [
  { icon: Zap, color: "var(--accent)", title: "1분 서버 생성", desc: "결제 즉시 자동으로 Docker 컨테이너가 만들어지고 접속 주소까지 연결돼요." },
  { icon: Bot, color: "var(--purple)", title: "AI 서버 관리", desc: "\"커맨드 블럭 켜줘\" 라고 채팅하면 AI가 실제 설정을 확인하고 바꿔줘요." },
  { icon: Terminal, color: "var(--cyan)", title: "실시간 콘솔", desc: "웹에서 바로 명령어를 입력하고 로그를 실시간으로 확인해요." },
  { icon: Users, color: "var(--blue)", title: "플레이어 관리", desc: "화이트리스트·OP·밴·킥을 버튼 하나로. RCON 설정 필요 없어요." },
  { icon: Puzzle, color: "var(--pink)", title: "플러그인·모드 마켓", desc: "Modrinth 검색부터 설치까지 클릭 몇 번, AI에게 부탁해도 돼요." },
  { icon: RefreshCw, color: "var(--lime)", title: "자동 백업", desc: "주기를 정해두면 알아서 백업하고, 위험한 작업 전엔 자동으로 스냅샷을 남겨요." },
  { icon: Globe, color: "var(--flame-2)", title: "서브도메인 자동 연결", desc: "서버를 만들면 이름.krl.kr 주소가 자동으로 생겨요. 포트 번호는 몰라도 돼요." },
  { icon: ShieldCheck, color: "var(--green)", title: "팀 협업", desc: "친구를 초대해서 운영자·개발자 권한을 나눠줄 수 있어요." },
];

const STEPS = [
  { n: 1, title: "플랜 선택", desc: "RAM/CPU/디스크와 서버 종류(Paper·Fabric·Forge 등)를 고르세요." },
  { n: 2, title: "계좌 입금", desc: "입금자명과 금액만 맞으면 자동으로 확인돼요." },
  { n: 3, title: "자동 생성", desc: "노드 배치부터 Docker 설치, 주소 연결까지 전부 자동이에요." },
  { n: 4, title: "바로 접속", desc: "생성된 주소를 친구에게 공유하고 바로 플레이하세요." },
];

const FAQ = [
  { q: "환불이 가능한가요?", a: "단순 변심에 의한 환불은 제한되며, 관련 법령이 정하는 절차에 따라 처리돼요. 자세한 내용은 이용약관을 확인해주세요." },
  { q: "AI가 서버를 마음대로 바꾸나요?", a: "아니요. 파일 수정·명령 실행처럼 실제 영향을 주는 작업은 항상 승인 버튼을 눌러야 실행돼요. 위험한 작업 전엔 자동으로 백업도 만들어요." },
  { q: "어떤 마인크래프트 버전을 지원하나요?", a: "Paper, Fabric, Forge, NeoForge, Vanilla 등 관리자가 등록한 서버 종류를 지원해요. 서버 생성 시 버전을 선택할 수 있어요." },
  { q: "결제는 어떻게 하나요?", a: "카드 없이 계좌 무통장입금으로 결제해요. 입금자명과 금액이 일치하면 자동으로 확인되고 서버가 만들어져요." },
];

async function loadLandingData() {
  try {
    const [products, events] = await Promise.all([
      prisma.product.findMany({
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        include: { allowedTemplates: { where: { active: true }, select: { displayName: true } } },
      }),
      prisma.event.findMany({
        where: { active: true, startsAt: { lte: new Date() }, endsAt: { gte: new Date() } },
        orderBy: { startsAt: "desc" },
        take: 1,
        include: { coupon: true },
      }),
    ]);
    return { products, events };
  } catch (err) {
    // DB에 잠깐 문제가 있어도 랜딩페이지 자체는 항상 떠야 한다
    console.error("[landing] 상품/이벤트 조회 실패:", err);
    return { products: [], events: [] };
  }
}

export default async function HomePage() {
  const user = await getCurrentUser().catch(() => null);
  const { products, events } = await loadLandingData();

  return (
    <div className="min-h-screen">
      <header className="border-b border-border sticky top-0 z-20 bg-bg/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold font-display">
            <BrandMark size={26} /> Burnae
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            {user ? (
              <Link href="/dashboard" className="btn-primary px-5 py-2.5 text-sm">대시보드</Link>
            ) : (
              <>
                <Link href="/login" className="hidden sm:inline text-sm text-text-dim hover:text-text px-3 py-2">
                  로그인
                </Link>
                <Link href="/register" className="btn-primary px-5 py-2.5 text-sm">시작하기</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <AnnouncementBanner maxWidthClass="max-w-6xl" />

      <main>
        {/* ── 히어로 ─────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <DotGrid />
          <div className="blob w-96 h-96 bg-flame-2 -top-20 -left-20 animate-float" />
          <div className="blob w-80 h-80 bg-purple top-40 right-0 animate-float" style={{ animationDelay: "-3s" }} />
          <div className="blob w-72 h-72 bg-cyan -bottom-10 left-1/3 animate-float" style={{ animationDelay: "-5s" }} />

          <div className="relative max-w-5xl mx-auto px-6 pt-24 sm:pt-32 pb-20 text-center">
            {events[0] && (
              <Link
                href="#pricing"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-xs sm:text-sm mb-8 hover:border-accent transition-colors animate-fade-up"
              >
                <Gift size={14} className="text-accent" />
                {events[0].title}
                {events[0].coupon && <span className="font-mono text-accent">{events[0].coupon.code}</span>}
              </Link>
            )}
            <h1 className="text-4xl sm:text-6xl font-bold font-display leading-[1.08] animate-fade-up">
              마인크래프트 서버,
              <br />
              <span className="text-gradient">말로 관리하는</span> 시대
            </h1>
            <p className="mt-6 text-lg text-text-dim max-w-xl mx-auto animate-fade-up" style={{ animationDelay: "0.1s" }}>
              1분 안에 서버를 만들고, 설정도 플러그인도 오류 해결도 채팅 한 줄로 끝내세요.
              복잡한 관리 패널은 저희가 다 가려드릴게요.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3 animate-fade-up" style={{ animationDelay: "0.2s" }}>
              <Link href="/register" className="btn-primary px-7 py-3.5 text-base inline-flex items-center gap-2">
                무료로 시작하기 <ArrowRight size={18} />
              </Link>
              <Link href="#pricing" className="btn-secondary px-7 py-3.5 text-base">
                가격 보기
              </Link>
            </div>

            <div className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-text-dim animate-fade-up" style={{ animationDelay: "0.3s" }}>
              <span className="inline-flex items-center gap-1.5"><Check size={16} className="text-green" /> 카드 없이 계좌이체 결제</span>
              <span className="inline-flex items-center gap-1.5"><Check size={16} className="text-green" /> 가입 없이 가격 확인</span>
              <span className="inline-flex items-center gap-1.5"><Check size={16} className="text-green" /> 언제든 해지 가능</span>
            </div>
          </div>
        </section>

        {/* ── 기능 ──────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center max-w-xl mx-auto">
            <h2 className="text-3xl font-bold font-display">호스팅에 필요한 모든 것</h2>
            <p className="mt-3 text-text-dim">Pterodactyl의 복잡함은 저희가 대신 다뤄요. 보이는 건 심플한 버튼뿐이에요.</p>
          </div>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="card-glow p-6">
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center"
                  style={{ background: `color-mix(in srgb, ${f.color} 18%, transparent)` }}
                >
                  <f.icon size={22} color={f.color} />
                </div>
                <h3 className="mt-4 font-semibold font-display">{f.title}</h3>
                <p className="mt-1.5 text-sm text-text-dim leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 작동 방식 ─────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-6 py-20">
          <div className="text-center max-w-xl mx-auto">
            <h2 className="text-3xl font-bold font-display">4단계면 끝</h2>
            <p className="mt-3 text-text-dim">관리자 승인도, 긴 대기도 없어요.</p>
          </div>
          <div className="mt-12 grid sm:grid-cols-4 gap-6 relative">
            {STEPS.map((s) => (
              <div key={s.n} className="text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-gradient-to-br from-flame-1 to-flame-3 flex items-center justify-center font-bold font-display text-white">
                  {s.n}
                </div>
                <h3 className="mt-4 font-semibold font-display">{s.title}</h3>
                <p className="mt-1.5 text-sm text-text-dim">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── AI 쇼케이스 ───────────────────────────── */}
        <section className="max-w-5xl mx-auto px-6 py-20">
          <div className="card-glow p-6 sm:p-10 grid sm:grid-cols-2 gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-medium text-purple bg-purple/10 rounded-full px-3 py-1">
                <Bot size={14} /> Burnae AI
              </div>
              <h2 className="mt-4 text-2xl sm:text-3xl font-bold font-display">채팅으로 서버를 조작해요</h2>
              <p className="mt-3 text-text-dim">
                서버 설정, 플러그인 설치, 오류 진단까지 실제 서버 파일과 콘솔을 직접 다루는 AI예요.
                위험한 작업은 항상 먼저 물어보고, 실행 전 자동으로 백업을 남겨요.
              </p>
            </div>
            <div className="card p-4 space-y-3 bg-bg">
              <ChatBubble from="user">커맨드 블럭 사용 가능하게 해줘</ChatBubble>
              <ChatBubble from="ai">
                server.properties에서 enable-command-block이 꺼져있어요. 켜고 재시작할까요?
              </ChatBubble>
              <div className="flex justify-end">
                <span className="text-xs bg-accent text-white rounded-full px-3 py-1.5 font-medium">적용하기</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── 가격 (비회원 열람 가능) ────────────────── */}
        <section id="pricing" className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center max-w-xl mx-auto">
            <h2 className="text-3xl font-bold font-display">투명한 가격</h2>
            <p className="mt-3 text-text-dim">가입하지 않아도 요금제를 확인할 수 있어요.</p>
          </div>

          {products.length === 0 ? (
            <p className="mt-10 text-center text-text-dim text-sm">요금제를 준비 중이에요. 곧 공개할게요.</p>
          ) : (
            <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {products.map((p, i) => (
                <div key={p.id} className={`card-glow p-6 flex flex-col ${i === 1 ? "border-accent" : ""}`}>
                  {i === 1 && (
                    <span className="self-start text-xs font-semibold text-accent bg-accent/10 rounded-full px-3 py-1 mb-3">인기</span>
                  )}
                  <h3 className="font-semibold text-lg font-display">{p.name}</h3>
                  {p.description && <p className="text-sm text-text-dim mt-1">{p.description}</p>}
                  <p className="mt-4 text-3xl font-bold font-display">
                    {p.priceMonthlyKrw.toLocaleString()}<span className="text-base font-normal text-text-dim">원/월</span>
                  </p>
                  <ul className="mt-5 space-y-2 text-sm flex-1">
                    <SpecRow label={`RAM ${(p.ramMb / 1024).toFixed(0)}GB`} />
                    <SpecRow label={`CPU ${p.cpuPercent}%`} />
                    <SpecRow label={`디스크 ${(p.diskMb / 1024).toFixed(0)}GB`} />
                    <SpecRow label={`백업 ${p.backupSlots}개`} />
                  </ul>
                  <Link href="/register" className="btn-primary w-full py-2.5 text-sm text-center mt-6">
                    이 플랜으로 시작
                  </Link>
                </div>
              ))}
            </div>
          )}

          <div className="card-glow mt-8 p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-5 border-accent">
            <div>
              <span className="text-xs font-semibold text-accent bg-accent/10 rounded-full px-3 py-1">무료</span>
              <h3 className="mt-3 text-xl font-bold font-display">돈 안 내고도 서버를 만들 수 있어요</h3>
              <p className="mt-2 text-sm text-text-dim max-w-md">
                친구 추천, 공식 디스코드 가입, 블로그·영상으로 홍보하기 등 다양한 방법으로 포인트를
                모으면 무료 체험 서버를 바로 받을 수 있어요. 모은 포인트는 서버 업그레이드에도 쓸 수 있어요.
              </p>
            </div>
            <Link href="/register" className="btn-primary px-6 py-3 text-sm shrink-0">
              무료로 시작하기
            </Link>
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────── */}
        <section className="max-w-3xl mx-auto px-6 py-20">
          <h2 className="text-3xl font-bold font-display text-center">자주 묻는 질문</h2>
          <div className="mt-10 space-y-3">
            {FAQ.map((item) => (
              <details key={item.q} className="card p-5 group">
                <summary className="font-medium cursor-pointer list-none flex items-center justify-between gap-3">
                  {item.q}
                  <span className="text-text-dim group-open:rotate-180 transition-transform shrink-0">
                    <ArrowRight size={16} className="rotate-90" />
                  </span>
                </summary>
                <p className="mt-3 text-sm text-text-dim leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── 마무리 CTA ────────────────────────────── */}
        <section className="max-w-4xl mx-auto px-6 pb-24">
          <div className="card-glow p-10 sm:p-14 text-center relative overflow-hidden">
            <div className="blob w-64 h-64 bg-flame-2 -top-10 -right-10" />
            <Rocket className="mx-auto text-accent relative" size={36} />
            <h2 className="mt-4 text-2xl sm:text-3xl font-bold font-display relative">지금 바로 서버를 만들어보세요</h2>
            <p className="mt-2 text-text-dim relative">가입은 30초, 서버 생성은 1분이면 충분해요.</p>
            <Link href="/register" className="btn-primary px-7 py-3.5 text-base inline-flex items-center gap-2 mt-7 relative">
              무료로 시작하기 <ArrowRight size={18} />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function SpecRow({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-2 text-text-dim">
      <Check size={15} className="text-green shrink-0" />
      {label}
    </li>
  );
}

function ChatBubble({ from, children }: { from: "user" | "ai"; children: React.ReactNode }) {
  const isUser = from === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
          isUser ? "bg-accent text-white" : "bg-surface-2 text-text"
        }`}
      >
        {isUser ? null : <MessageCircle size={14} className="inline mr-1.5 -mt-0.5 text-purple" />}
        {children}
      </div>
    </div>
  );
}
