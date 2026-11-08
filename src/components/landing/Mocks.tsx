import { Check, Folder, FileText, Globe, Plus, RotateCcw, Shield, Search, Download, Play, Square, Crown, Ban, UserCheck } from "lucide-react";

/* 랜딩용 제품 화면 목업 — 전부 코드로 그린 UI (이미지 아님) */

export function Win({
  title, right, children, className = "",
}: { title?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-surface overflow-hidden text-[13px] shadow-2xl shadow-black/30 ${className}`}>
      <div className="flex items-center gap-3 px-4 h-10 border-b border-border text-[11px] text-text-dim">
        <span className="flex gap-1.5">
          <i className="w-2.5 h-2.5 rounded-full bg-border" /><i className="w-2.5 h-2.5 rounded-full bg-border" /><i className="w-2.5 h-2.5 rounded-full bg-border" />
        </span>
        {title && <span className="tracking-wide">{title}</span>}
        {right && <span className="ml-auto">{right}</span>}
      </div>
      {children}
    </div>
  );
}

const Dot = ({ c = "bg-green" }: { c?: string }) => <i className={`inline-block w-1.5 h-1.5 rounded-full ${c}`} />;
const Chip = ({ children, tone = "" }: { children: React.ReactNode; tone?: string }) => (
  <span className={`text-[11px] rounded-md border border-border px-2 py-0.5 text-text-dim ${tone}`}>{children}</span>
);
const Btn = ({ children, primary }: { children: React.ReactNode; primary?: boolean }) => (
  <span className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[11px] font-semibold ${primary ? "bg-accent text-white" : "border border-border text-text"}`}>{children}</span>
);

export function ServersMock() {
  const rows = [
    { n: "discord-bot-01", k: "디스코드 봇", s: "실행 중", ram: 62, on: true },
    { n: "code-server", k: "VPS", s: "실행 중", ram: 38, on: true },
    { n: "uptime-kuma", k: "유틸리티", s: "설치 중…", ram: 8, on: false },
  ];
  return (
    <Win title="내 서버" right={<Btn primary><Plus size={12} /> 새 서버</Btn>}>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.n} className="flex items-center gap-4 px-4 py-3.5">
            <Dot c={r.on ? "bg-green" : "bg-accent animate-pulse"} />
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{r.n}</p>
              <p className="text-[11px] text-text-dim">{r.k} · {r.s}</p>
            </div>
            <div className="w-24 hidden sm:block">
              <div className="h-1 rounded-full bg-surface-2"><div className="h-1 rounded-full bg-accent" style={{ width: `${r.ram}%` }} /></div>
              <p className="mt-1 text-[10px] text-text-dim text-right">RAM {r.ram}%</p>
            </div>
          </li>
        ))}
      </ul>
    </Win>
  );
}

export function ConsoleMock({ lines }: { lines?: string[] }) {
  const L = lines ?? [
    "[18:40:02] INFO  봇을 시작합니다",
    "[18:40:04] INFO  디스코드 연결 완료",
    "[18:40:04] INFO  명령어 24개 등록됨",
    "[18:41:12] INFO  서버 12곳에서 온라인",
  ];
  return (
    <Win title="콘솔" right={<span className="inline-flex items-center gap-1.5"><Dot /> 실시간</span>}>
      <div className="p-4 font-mono text-[11.5px] leading-6 text-text-dim bg-bg/40 min-h-44">
        {L.map((l) => <p key={l}>{l}</p>)}
      </div>
      <div className="flex items-center gap-2 px-4 py-3 border-t border-border font-mono text-[12px]">
        <span className="text-accent">›</span><span className="text-text-dim">명령어 입력…</span>
        <span className="ml-auto w-1.5 h-4 bg-text/70 animate-pulse" />
      </div>
    </Win>
  );
}

export function BackupMock() {
  const rows = [["오늘 03:00", "자동", "412 MB"], ["어제 03:00", "자동", "409 MB"], ["플러그인 설치 전", "AI 스냅샷", "405 MB"]];
  return (
    <Win title="백업" right={<span className="inline-flex items-center gap-2">자동 백업 <i className="w-7 h-4 rounded-full bg-accent relative"><i className="absolute right-0.5 top-0.5 w-3 h-3 rounded-full bg-white" /></i></span>}>
      <ul className="divide-y divide-border">
        {rows.map(([n, t, s]) => (
          <li key={n} className="flex items-center gap-3 px-4 py-3.5">
            <Shield size={15} className="text-text-dim" />
            <div className="flex-1"><p className="font-medium">{n}</p><p className="text-[11px] text-text-dim">{t} · {s}</p></div>
            <Btn><RotateCcw size={11} /> 복원</Btn>
          </li>
        ))}
      </ul>
    </Win>
  );
}

export function DomainMock() {
  return (
    <Win title="접속 주소">
      <div className="p-5 space-y-4">
        <div className="flex items-stretch rounded-lg border border-border overflow-hidden">
          <span className="flex-1 px-4 py-3 bg-surface-2">my-server</span>
          <span className="px-4 py-3 text-text-dim border-l border-border">.krl.kr</span>
        </div>
        <div className="flex items-center gap-2 text-green text-xs"><Check size={14} /> 연결됨 · 몇 초 안에 접속 가능</div>
        <div className="rounded-lg border border-border px-4 py-3 flex items-center gap-3">
          <Globe size={15} className="text-text-dim" />
          <span className="flex-1 text-text-dim">내 도메인 연결 (예: bot.example.com)</span>
          <Btn>추가</Btn>
        </div>
      </div>
    </Win>
  );
}

export function TeamMock() {
  const rows = [["나", "소유자", "bg-accent/15 text-accent"], ["minjun", "운영자", ""], ["sooyeon", "개발자", ""]];
  return (
    <Win title="팀" right={<Btn><Plus size={12} /> 초대</Btn>}>
      <ul className="divide-y divide-border">
        {rows.map(([n, r, tone]) => (
          <li key={n} className="flex items-center gap-3 px-4 py-3.5">
            <span className="w-7 h-7 rounded-full bg-surface-2 border border-border flex items-center justify-center text-[11px] uppercase">{n[0]}</span>
            <span className="flex-1 font-medium">{n}</span>
            <Chip tone={tone}>{r}</Chip>
          </li>
        ))}
      </ul>
    </Win>
  );
}

export function EnvMock() {
  const rows = [["BOT_TOKEN", "••••••••••••••••"], ["PREFIX", "!"], ["TZ", "Asia/Seoul"]];
  return (
    <Win title="시작 변수" right={<Btn primary>저장</Btn>}>
      <ul className="divide-y divide-border font-mono text-[12px]">
        {rows.map(([k, v]) => (
          <li key={k} className="grid grid-cols-[120px_1fr] items-center gap-3 px-4 py-3">
            <span className="text-text-dim">{k}</span>
            <span className="rounded-md bg-surface-2 border border-border px-3 py-1.5">{v}</span>
          </li>
        ))}
      </ul>
    </Win>
  );
}

export function DeployMock() {
  const steps = ["저장소 가져오기", "의존성 설치", "빌드", "서버 시작"];
  return (
    <Win title="GitHub 배포">
      <div className="p-5 space-y-4">
        <div className="rounded-lg border border-border bg-surface-2 px-4 py-2.5 font-mono text-[12px] text-text-dim">github.com/my-name/my-bot</div>
        <div className="flex flex-wrap gap-1.5">{["Red", "Muse", "Uptime Kuma", "Gitea"].map((x) => <Chip key={x}>{x}</Chip>)}</div>
        <ul className="space-y-2">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-2.5 text-xs">
              <span className={`w-4 h-4 rounded-full flex items-center justify-center ${i < 3 ? "bg-green/20 text-green" : "bg-accent/20 text-accent"}`}>{i < 3 ? <Check size={10} /> : <Play size={8} />}</span>
              <span className={i < 3 ? "text-text-dim" : ""}>{s}</span>
            </li>
          ))}
        </ul>
      </div>
    </Win>
  );
}

export function PlayersMock() {
  const rows = [["Steve", "접속 중", <Crown key="c" size={13} className="text-accent" />], ["Alex", "접속 중", null], ["Herobrine", "차단됨", <Ban key="b" size={13} className="text-red" />]];
  return (
    <Win title="플레이어" right={<Chip>화이트리스트 켜짐</Chip>}>
      <ul className="divide-y divide-border">
        {rows.map(([n, s, ic]) => (
          <li key={n as string} className="flex items-center gap-3 px-4 py-3">
            <span className="w-7 h-7 rounded-md bg-surface-2 border border-border flex items-center justify-center text-[11px]">{(n as string)[0]}</span>
            <div className="flex-1"><p className="font-medium">{n}</p><p className="text-[11px] text-text-dim">{s}</p></div>
            {ic}
            <Btn><UserCheck size={11} /> OP</Btn>
          </li>
        ))}
      </ul>
    </Win>
  );
}

export function PluginsMock() {
  const rows = [["EssentialsX", "필수 명령어 모음"], ["WorldEdit", "맵 편집 도구"], ["LuckPerms", "권한 관리"]];
  return (
    <Win title="플러그인·모드" right={<span className="inline-flex items-center gap-1.5 text-text-dim"><Search size={12} /> Modrinth 검색</span>}>
      <ul className="divide-y divide-border">
        {rows.map(([n, d]) => (
          <li key={n} className="flex items-center gap-3 px-4 py-3.5">
            <span className="w-8 h-8 rounded-md bg-surface-2 border border-border flex items-center justify-center"><Download size={14} className="text-text-dim" /></span>
            <div className="flex-1"><p className="font-medium">{n}</p><p className="text-[11px] text-text-dim">{d}</p></div>
            <Btn primary>설치</Btn>
          </li>
        ))}
      </ul>
    </Win>
  );
}

export function EditorMock() {
  return (
    <Win title="Code-Server">
      <div className="grid grid-cols-[130px_1fr] min-h-44">
        <div className="border-r border-border p-3 space-y-2 text-[12px] text-text-dim">
          <p className="flex items-center gap-1.5"><Folder size={13} /> src</p>
          <p className="flex items-center gap-1.5 pl-3 text-text"><FileText size={13} /> index.js</p>
          <p className="flex items-center gap-1.5 pl-3"><FileText size={13} /> .env</p>
          <p className="flex items-center gap-1.5"><FileText size={13} /> package.json</p>
        </div>
        <pre className="p-4 font-mono text-[11.5px] leading-6 text-text-dim overflow-hidden"><span className="text-accent">const</span> client = <span className="text-accent">new</span> Client();{"\n"}client.<span className="text-text">on</span>(<span className="text-green">&quot;ready&quot;</span>, () =&gt; {"{"}{"\n"}{"  "}console.<span className="text-text">log</span>(<span className="text-green">&quot;online&quot;</span>);{"\n"}{"}"});</pre>
      </div>
    </Win>
  );
}

export function DepositMock() {
  return (
    <Win title="입금 확인">
      <div className="p-5 space-y-3.5">
        {[["입금자명", "홍길동"], ["금액", "4,500원"], ["상태", ""]].map(([k, v]) => (
          <div key={k} className="flex justify-between items-center border-b border-border pb-3 last:border-0 last:pb-0">
            <span className="text-text-dim text-xs">{k}</span>
            {v ? <span className="font-medium">{v}</span> : <span className="inline-flex items-center gap-1.5 text-green text-xs"><Check size={14} /> 자동 확인 완료</span>}
          </div>
        ))}
      </div>
    </Win>
  );
}

export function PointsMock() {
  return (
    <Win title="포인트" right={<span className="text-accent font-semibold">20 P</span>}>
      <ul className="divide-y divide-border">
        {[["친구 추천", "+10 P", true], ["공식 디스코드 가입", "+5 P", true], ["블로그로 홍보하기", "+30 P", false]].map(([n, p, d]) => (
          <li key={n as string} className="flex items-center gap-3 px-4 py-3.5">
            <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${d ? "bg-green border-green text-white" : "border-border"}`}>{d && <Check size={10} />}</span>
            <span className="flex-1">{n}</span>
            <span className="text-text-dim text-xs">{p}</span>
          </li>
        ))}
      </ul>
    </Win>
  );
}

export function CreatedMock() {
  return (
    <Win title="서버 생성 완료">
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-2 text-green text-sm font-medium"><Check size={16} /> 서버가 준비됐어요</div>
        <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 font-mono text-[12px] flex items-center justify-between">my-server.krl.kr <Chip>복사</Chip></div>
        <div className="flex gap-2"><Btn primary><Play size={11} /> 시작</Btn><Btn><Square size={11} /> 중지</Btn></div>
      </div>
    </Win>
  );
}

export function AiMock({ user, ai, server, kind, applyLabel }: { user: string; ai: string; server: string; kind: string; applyLabel: string }) {
  return (
    <Win title="BURNAE AI" right={<span className="inline-flex items-center gap-1.5"><Dot /> Online</span>}>
      <div className="p-5 space-y-4">
        <div className="flex justify-between text-xs text-text-dim"><span>서버 / <span className="text-text">{server}</span></span><span>{kind}</span></div>
        <div className="rounded-lg border border-border bg-surface-2 px-4 py-3">{user}</div>
        <div className="flex gap-3">
          <span className="shrink-0 w-6 h-6 rounded-md bg-accent/15 text-accent text-[11px] font-bold flex items-center justify-center">B</span>
          <p className="leading-relaxed">{ai}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-border">
        <span className="text-xs text-text-dim">실행 전 자동 백업 완료</span>
        <Btn primary>{applyLabel}</Btn>
      </div>
    </Win>
  );
}

/** 넓은 대시보드 전체 화면 목업 (히어로 아래) */
export function DashboardWide() {
  const pts = [18, 24, 20, 32, 28, 40, 36, 52, 46, 60, 55, 72];
  const path = pts.map((y, i) => `${i ? "L" : "M"}${(i / (pts.length - 1)) * 300},${80 - y}`).join(" ");
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-2xl shadow-black/30 text-[13px]">
      <div className="grid md:grid-cols-[190px_1fr]">
        <aside className="hidden md:block border-r border-border p-4 space-y-1 bg-bg/40">
          <p className="flex items-center gap-2 font-semibold mb-4">Burnae</p>
          {["내 서버", "포인트 받기", "포인트 상점", "결제 내역", "고객지원", "계정"].map((x, i) => (
            <p key={x} className={`rounded-lg px-3 py-2 text-xs ${i === 0 ? "bg-accent/15 text-text" : "text-text-dim"}`}>{x}</p>
          ))}
        </aside>
        <div className="p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between"><p className="font-semibold text-base">내 서버</p><Btn primary><Plus size={12} /> 새 서버</Btn></div>
          <div className="grid sm:grid-cols-3 gap-3">
            {[["discord-bot-01", "실행 중"], ["code-server", "실행 중"], ["uptime-kuma", "중지됨"]].map(([n, s], i) => (
              <div key={n} className="rounded-lg border border-border p-4">
                <p className="flex items-center gap-2 text-xs text-text-dim"><Dot c={i === 2 ? "bg-text-dim" : "bg-green"} /> {s}</p>
                <p className="mt-2 font-medium">{n}</p>
                <svg viewBox="0 0 300 80" className="mt-3 w-full h-12" preserveAspectRatio="none" aria-hidden>
                  <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" opacity={i === 2 ? 0.25 : 1} />
                </svg>
              </div>
            ))}
          </div>
          <ConsoleMock />
        </div>
      </div>
    </div>
  );
}
