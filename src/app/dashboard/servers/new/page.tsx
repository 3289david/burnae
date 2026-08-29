"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Check,
  Search,
  Package,
  Leaf,
  Hammer,
  Zap,
  Flame,
  Boxes,
  Anvil,
  Sparkles,
  Box,
  Bot,
  Music,
  Activity,
  BarChart3,
  FileText,
  Database,
  Network,
  Code2,
  Terminal,
  Radio,
  Waves,
  Dices,
} from "lucide-react";

interface Template {
  id: string;
  key: string;
  displayName: string;
  minecraftVersions: string[];
  category: "MINECRAFT" | "VPS" | "DISCORD_BOT" | "GENERAL";
  defaultEnvironment: Record<string, unknown>;
  availableDockerImages: Record<string, string> | null;
}
interface Product {
  id: string;
  name: string;
  description: string | null;
  ramMb: number;
  diskMb: number;
  priceMonthlyKrw: number;
  allowedTemplates: Template[];
}
interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}
interface OrderState {
  id: string;
  amountKrw: number;
  depositorName: string;
  isPreorder: boolean;
  status: string;
  serverId?: string | null;
  preorderWaiting?: boolean;
}

/** 서버 종류 key(예: paper_mid, paper_legacy)에서 "기본 로더 이름"만 뽑아낸다 —
 *  버전대별로 나뉜 템플릿들을 카드 하나로 묶어 보여주기 위함 */
function loaderBaseKey(key: string): string {
  return key.replace(/_(mid|legacy)$/i, "");
}

function tierLabel(key: string): string {
  if (key.endsWith("_legacy")) return "레거시";
  if (key.endsWith("_mid")) return "중간";
  return "최신";
}

const LOADER_META: Record<string, { icon: typeof Package; color: string; blurb: string }> = {
  paper: { icon: Package, color: "var(--accent)", blurb: "가장 대중적인 플러그인 서버" },
  vanilla: { icon: Leaf, color: "var(--lime)", blurb: "모드/플러그인 없는 순정" },
  forge: { icon: Hammer, color: "var(--purple)", blurb: "가장 많은 모드 지원" },
  purpur: { icon: Zap, color: "var(--pink)", blurb: "Paper 기반, 기능 확장판" },
  spigot: { icon: Flame, color: "var(--flame-2)", blurb: "Paper의 원조 플러그인 서버" },
  fabric: { icon: Boxes, color: "var(--cyan)", blurb: "가볍고 빠른 모드 로더" },
  neoforge: { icon: Anvil, color: "var(--blue)", blurb: "Forge의 차세대 후속" },
  mohist: { icon: Sparkles, color: "var(--yellow)", blurb: "모드+플러그인 동시 지원" },

  // 일반 서버(VPS/디스코드 봇/유틸리티) 종류
  "code-server": { icon: Terminal, color: "var(--accent)", blurb: "브라우저에서 VS Code로 코딩" },
  "nodejs-bot": { icon: Bot, color: "var(--lime)", blurb: "Node.js로 직접 만드는 봇" },
  "python-bot": { icon: Bot, color: "var(--lime)", blurb: "Python으로 직접 만드는 봇" },
  "red-discordbot": { icon: Bot, color: "var(--purple)", blurb: "커뮤니티 큰 모듈형 봇 프레임워크" },
  "muse-musicbot": { icon: Music, color: "var(--pink)", blurb: "안정적인 인기 음악봇" },
  "aoede-musicbot": { icon: Music, color: "var(--pink)", blurb: "Spotify 연동 음악봇" },
  "dynamica-bot": { icon: Bot, color: "var(--cyan)", blurb: "동적 음성채널 자동 생성봇" },
  "game-server-watcher": { icon: Activity, color: "var(--blue)", blurb: "게임서버 상태 모니터링봇" },
  jmusicbot: { icon: Music, color: "var(--pink)", blurb: "안정적인 자바 기반 음악봇" },
  "ree6-bot": { icon: Bot, color: "var(--flame-2)", blurb: "레벨링·모더레이션 올인원 봇" },
  "golang-generic": { icon: Code2, color: "var(--cyan)", blurb: "Go 코드 직접 업로드" },
  "java-generic": { icon: Code2, color: "var(--flame-2)", blurb: "Java(.jar) 직접 업로드" },
  "csharp-generic": { icon: Code2, color: "var(--purple)", blurb: "C#/.NET 직접 업로드" },
  "rust-generic": { icon: Code2, color: "var(--flame-2)", blurb: "Rust 코드 직접 업로드" },
  "deno-generic": { icon: Code2, color: "var(--blue)", blurb: "Deno 런타임 코드 직접 업로드" },
  "bun-generic": { icon: Code2, color: "var(--yellow)", blurb: "Bun 런타임 코드 직접 업로드" },
  "uptime-kuma": { icon: Activity, color: "var(--green)", blurb: "서버·사이트 다운타임 모니터링" },
  gitea: { icon: Box, color: "var(--lime)", blurb: "가벼운 자체 호스팅 깃 서버" },
  "postgres-16": { icon: Database, color: "var(--blue)", blurb: "관계형 DB 서버" },
  "redis-7": { icon: Database, color: "var(--flame-2)", blurb: "초고속 캐시/DB 서버" },
  "mongodb-7": { icon: Database, color: "var(--green)", blurb: "NoSQL 문서 DB 서버" },
  grafana: { icon: BarChart3, color: "var(--flame-2)", blurb: "예쁜 모니터링 대시보드" },
  prometheus: { icon: Activity, color: "var(--flame-2)", blurb: "메트릭 수집·저장" },
  rabbitmq: { icon: Network, color: "var(--flame-2)", blurb: "메시지 큐 브로커" },
  meilisearch: { icon: Search, color: "var(--purple)", blurb: "빠른 검색 엔진" },
  "haste-server": { icon: FileText, color: "var(--cyan)", blurb: "코드/텍스트 스니펫 공유" },
  corpbot: { icon: Bot, color: "var(--lime)", blurb: "Python 모듈형 봇 프레임워크" },
  fragbot: { icon: Bot, color: "var(--cyan)", blurb: "심플한 디스코드 봇" },
  atlbot: { icon: Bot, color: "var(--blue)", blurb: "ATLauncher 공식 봇" },
  "pixel-bot": { icon: Bot, color: "var(--purple)", blurb: "Python 디스코드 봇" },
  bastion: { icon: Bot, color: "var(--flame-2)", blurb: "올인원 봇 (별도 MongoDB 서버 필요)" },
  phantombot: { icon: Radio, color: "var(--purple)", blurb: "유명한 트위치 채팅봇" },
  sogebot: { icon: Radio, color: "var(--pink)", blurb: "트위치 스트리머용 봇" },
  lavalink: { icon: Waves, color: "var(--cyan)", blurb: "음악봇용 오디오 노드" },
};

function loaderMeta(baseKey: string) {
  return LOADER_META[baseKey] ?? { icon: Box, color: "var(--accent)", blurb: "" };
}

const TIER_ORDER: Record<string, number> = { 최신: 0, 중간: 1, 레거시: 2 };

const NAME_ADJECTIVES = ["즐거운", "든든한", "반짝이는", "포근한", "용감한", "느긋한", "은은한", "씩씩한", "신비한", "아늑한"];
const NAME_NOUNS = ["감자밭", "은하수", "다락방", "탐험대", "비밀기지", "요새", "정원", "등대", "오두막", "항구"];

function randomServerName(): string {
  const a = NAME_ADJECTIVES[Math.floor(Math.random() * NAME_ADJECTIVES.length)];
  const n = NAME_NOUNS[Math.floor(Math.random() * NAME_NOUNS.length)];
  return `${a} ${n}`;
}

type Step = "form" | "pay" | "choose" | "done" | "loading";

export default function NewServerPage() {
  return (
    <Suspense fallback={null}>
      <NewServerPageInner />
    </Suspense>
  );
}

function NewServerPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const grantOrderId = searchParams.get("orderId");
  const prefillProductId = searchParams.get("productId");
  const [step, setStep] = useState<Step>(grantOrderId ? "loading" : "form");
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [serverName, setServerName] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [depositorName, setDepositorName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [order, setOrder] = useState<OrderState | null>(null);
  const [bank, setBank] = useState<BankAccount | null>(null);
  const [stillWaitingForNode, setStillWaitingForNode] = useState(false);

  // 결제 후 서버 종류/버전 선택용 상태
  const [templateId, setTemplateId] = useState("");
  const [version, setVersion] = useState("");
  const [versionQuery, setVersionQuery] = useState("");
  const [gitRepo, setGitRepo] = useState("");
  const [dockerImage, setDockerImage] = useState("");
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    fetch("/api/catalog/products")
      .then((r) => r.json())
      .then((data: Product[]) => {
        setProducts(data);
        if (grantOrderId) return;
        const prefilled = prefillProductId && data.find((p) => p.id === prefillProductId);
        setProductId(prefilled ? prefilled.id : data[0]?.id ?? "");
      });
  }, [grantOrderId, prefillProductId]);

  // 관리자가 지급한 서버 등 — 결제는 끝났고 종류/버전만 고르면 되는 주문을 바로 불러온다
  useEffect(() => {
    if (!grantOrderId) return;
    fetch(`/api/orders/${grantOrderId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.serverId) {
          router.replace(`/dashboard/servers/${data.serverId}`);
          return;
        }
        if (data.status !== "PAID" || data.templateIdRequested) {
          setError("이 주문은 이미 처리됐거나 종류를 고를 수 없어요.");
          setStep("form");
          return;
        }
        if (data.product) {
          setProducts((prev) => (prev.some((p) => p.id === data.product.id) ? prev : [...prev, data.product]));
          setProductId(data.product.id);
        }
        setOrder({ id: data.id, amountKrw: data.amountKrw, depositorName: data.depositorName, isPreorder: data.isPreorder, status: data.status });
        setStep("choose");
      })
      .catch(() => {
        setError("주문 정보를 불러오지 못했어요.");
        setStep("form");
      });
  }, [grantOrderId, router]);

  const selectedProduct = useMemo(() => products.find((p) => p.id === productId), [products, productId]);
  const selectedTemplate = useMemo(
    () => selectedProduct?.allowedTemplates.find((t) => t.id === templateId),
    [selectedProduct, templateId],
  );

  // 같은 로더(paper / paper_mid / paper_legacy...)를 카드 하나로 묶는다
  const loaderGroups = useMemo(() => {
    if (!selectedProduct) return [];
    const groups = new Map<string, Template[]>();
    for (const t of selectedProduct.allowedTemplates) {
      const base = loaderBaseKey(t.key);
      if (!groups.has(base)) groups.set(base, []);
      groups.get(base)!.push(t);
    }
    return [...groups.entries()].map(([base, templates]) => ({
      base,
      templates: templates.sort((a, b) => (TIER_ORDER[tierLabel(a.key)] ?? 0) - (TIER_ORDER[tierLabel(b.key)] ?? 0)),
    }));
  }, [selectedProduct]);

  const selectedGroup = useMemo(
    () => loaderGroups.find((g) => g.templates.some((t) => t.id === templateId)),
    [loaderGroups, templateId],
  );

  function pickLoader(base: string) {
    const group = loaderGroups.find((g) => g.base === base);
    const t = group?.templates[0];
    if (!t) return;
    setTemplateId(t.id);
    setVersion(t.minecraftVersions[0] ?? "");
    setVersionQuery("");
    setDockerImage(Object.values(t.availableDockerImages ?? {})[0] ?? "");
  }

  function pickTier(t: Template) {
    setTemplateId(t.id);
    setVersion(t.minecraftVersions[0] ?? "");
    setVersionQuery("");
    setDockerImage(Object.values(t.availableDockerImages ?? {})[0] ?? "");
  }

  const filteredVersions = useMemo(() => {
    if (!selectedTemplate) return [];
    const q = versionQuery.trim().toLowerCase();
    if (!q) return selectedTemplate.minecraftVersions;
    return selectedTemplate.minecraftVersions.filter((v) => v.toLowerCase().includes(q));
  }, [selectedTemplate, versionQuery]);

  function goToOutcome(data: { serverId?: string | null; preorderWaiting?: boolean }) {
    if (!data.serverId && data.preorderWaiting) {
      setStillWaitingForNode(true);
      setStep("done");
      setTimeout(() => router.push("/dashboard/billing"), 2500);
      return;
    }
    setStep("done");
    setTimeout(() => {
      if (data.serverId) router.push(`/dashboard/servers/${data.serverId}`);
      else router.push("/dashboard");
    }, 1500);
  }

  async function submitOrder(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          serverName,
          couponCode: couponCode || undefined,
          depositorName: depositorName || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "주문 생성에 실패했습니다.");
      setOrder(data);

      // 쿠폰 등으로 0원 결제라 이미 처리됐으면 입금 안내 없이 바로 "서버 종류 고르기"로
      if (data.status === "PAID") {
        setStep("choose");
        return;
      }

      const bankRes = await fetch("/api/payment/bank-account");
      if (bankRes.ok) setBank(await bankRes.json());
      setStep("pay");
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  // 입금 대기 중 폴링 — PAID로 바뀌면 "서버 종류 고르기" 단계로 넘어간다
  useEffect(() => {
    if (step !== "pay" || !order) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/orders/${order.id}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === "PAID") {
        clearInterval(interval);
        setStep("choose");
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [step, order]);

  async function submitTemplateChoice(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;
    setError(null);
    setChoosing(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          minecraftVersion: version || undefined,
          gitRepo: gitRepo || undefined,
          dockerImage: dockerImage || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "처리에 실패했습니다.");
      goToOutcome(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setChoosing(false);
    }
  }

  if (step === "loading") {
    return (
      <div className="max-w-md mx-auto text-center py-16 text-text-dim text-sm">
        불러오는 중...
      </div>
    );
  }

  if (step === "pay" && order) {
    return (
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold">입금 안내</h1>
        <div className="card mt-6 p-6 space-y-3">
          {order.isPreorder && (
            <p className="text-xs bg-yellow/10 border border-yellow/30 text-yellow rounded-lg px-3 py-2">
              지금은 이 플랜의 여유 자리가 없어서 선주문으로 진행돼요. 결제가 확인되면 자리가 나는
              대로 자동으로 서버가 생성됩니다.
            </p>
          )}
          {bank && (
            <>
              <Row label="은행" value={bank.bankName} />
              <Row label="계좌번호" value={bank.accountNumber} />
              <Row label="예금주" value={bank.accountHolder} />
            </>
          )}
          <Row label="입금자명" value={order.depositorName} highlight />
          <Row label="입금 금액" value={`${order.amountKrw.toLocaleString()}원`} highlight />
          <p className="text-xs text-text-dim pt-2">
            입금자명과 금액이 정확히 일치해야 자동으로 확인돼요. 결제가 확인되면 바로 이어서 서버
            종류와 버전을 고를 수 있어요.
          </p>
          <div className="flex items-center gap-2 text-sm text-text-dim pt-2">
            <span className="animate-pulse">●</span> 입금 확인 대기 중...
          </div>
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="max-w-md mx-auto">
        <div className="card mt-6 p-6 text-center animate-[fadeIn_0.3s_ease]">
          <CheckCircle2 size={36} className="mx-auto text-green" />
          <p className="mt-2 font-semibold">
            {stillWaitingForNode ? "선주문으로 접수됐어요!" : "서버를 만들고 있어요!"}
          </p>
          <p className="text-sm text-text-dim mt-1">
            {stillWaitingForNode
              ? "지금은 배치할 노드 자리가 없어서 선주문으로 접수됐어요. 자리가 나는 대로 자동으로 서버가 생성돼요."
              : "잠시 후 서버 페이지로 이동할게요..."}
          </p>
        </div>
      </div>
    );
  }

  if (step === "choose" && order) {
    return (
      <div className="max-w-2xl mx-auto pb-16">
        <div className="card mt-2 mb-8 p-4 flex items-center gap-3 border-green/40 bg-green/[0.06]">
          <CheckCircle2 size={20} className="text-green shrink-0" />
          <p className="text-sm">결제가 확인됐어요! 이제 서버 종류와 버전만 고르면 바로 만들어져요.</p>
        </div>

        <h1 className="text-2xl font-bold">서버 종류 고르기</h1>
        <p className="text-sm text-text-dim mt-1">어떤 로더로 시작할지, 어떤 버전으로 할지 골라주세요.</p>

        <form onSubmit={submitTemplateChoice} className="mt-8 space-y-10">
          {selectedProduct && loaderGroups.length > 0 && (
            <Section step={1} title="서버 종류">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {loaderGroups.map((g) => {
                  const meta = loaderMeta(g.base);
                  const Icon = meta.icon;
                  const active = selectedGroup?.base === g.base;
                  return (
                    <button
                      type="button"
                      key={g.base}
                      onClick={() => pickLoader(g.base)}
                      className={`rounded-2xl border p-3.5 flex flex-col items-start gap-2 transition-all duration-150 ${
                        active
                          ? "border-accent bg-accent/[0.08] shadow-[0_0_0_1px_var(--accent)]"
                          : "border-border bg-surface hover:border-accent/40 hover:bg-surface-2"
                      }`}
                    >
                      <span
                        className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ background: `color-mix(in srgb, ${meta.color} 18%, transparent)` }}
                      >
                        <Icon size={18} style={{ color: meta.color }} />
                      </span>
                      <span className="font-semibold text-sm capitalize">{g.base}</span>
                      <span className="text-text-dim text-[11px] leading-tight -mt-1">{meta.blurb}</span>
                    </button>
                  );
                })}
              </div>

              {/* 버전대(최신/중간/레거시) 탭 — 로더에 하나만 있으면 숨김 */}
              {selectedGroup && selectedGroup.templates.length > 1 && (
                <div className="flex gap-1.5 mt-4 p-1 bg-surface-2 rounded-full w-fit">
                  {selectedGroup.templates.map((t) => {
                    const active = t.id === templateId;
                    return (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => pickTier(t)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-150 ${
                          active ? "bg-accent text-white shadow-sm" : "text-text-dim hover:text-text"
                        }`}
                      >
                        {tierLabel(t.key)}
                      </button>
                    );
                  })}
                </div>
              )}
            </Section>
          )}

          {selectedTemplate && selectedTemplate.category === "MINECRAFT" && (
            <Section step={2} title="마인크래프트 버전">
              {selectedTemplate.minecraftVersions.length > 8 && (
                <div className="relative mb-3">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim" />
                  <input
                    className="input w-full pl-9"
                    placeholder="버전 검색 (예: 1.21)"
                    value={versionQuery}
                    onChange={(e) => setVersionQuery(e.target.value)}
                  />
                </div>
              )}
              <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto pr-1">
                {filteredVersions.map((v) => {
                  const active = v === version;
                  return (
                    <button
                      type="button"
                      key={v}
                      onClick={() => setVersion(v)}
                      className={`px-3.5 py-2 rounded-xl text-sm font-medium border transition-all duration-150 flex items-center gap-1.5 ${
                        active
                          ? "border-accent bg-accent text-white shadow-[0_4px_14px_-4px_rgba(255,106,26,0.6)]"
                          : "border-border bg-surface text-text-dim hover:border-accent/40 hover:text-text"
                      }`}
                    >
                      {active && <Check size={13} />}
                      {v}
                    </button>
                  );
                })}
                {filteredVersions.length === 0 && (
                  <p className="text-text-dim text-sm py-2">검색 결과가 없어요.</p>
                )}
              </div>
            </Section>
          )}

          {selectedTemplate && Object.keys(selectedTemplate.availableDockerImages ?? {}).length > 1 && (
            <Section step={2} title="런타임 버전">
              <div className="flex flex-wrap gap-2">
                {Object.entries(selectedTemplate.availableDockerImages!).map(([label, image]) => {
                  const active = image === dockerImage;
                  return (
                    <button
                      type="button"
                      key={image}
                      onClick={() => setDockerImage(image)}
                      className={`px-3.5 py-2 rounded-xl text-sm font-medium border transition-all duration-150 ${
                        active
                          ? "border-accent bg-accent text-white"
                          : "border-border bg-surface text-text-dim hover:border-accent/40 hover:text-text"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </Section>
          )}

          {selectedTemplate && "GIT_ADDRESS" in selectedTemplate.defaultEnvironment && (
            <Section step={Object.keys(selectedTemplate.availableDockerImages ?? {}).length > 1 ? 3 : 2} title="시작 코드 (선택)">
              <p className="text-xs text-text-dim mb-2">
                비워두면 빈 서버로 시작해요 — 파일 탭이나 SFTP로 직접 코드를 올리면 돼요. GitHub
                저장소에 코드가 있다면 주소를 넣어주세요 — 서버 생성 시 자동으로 clone해서 시작해요.
              </p>
              <input
                type="url"
                className="input w-full"
                placeholder="https://github.com/아이디/저장소이름"
                value={gitRepo}
                onChange={(e) => setGitRepo(e.target.value)}
              />
            </Section>
          )}

          {error && (
            <p className="text-sm text-red bg-red/10 border border-red/30 rounded-xl px-3.5 py-2.5">{error}</p>
          )}

          <button
            type="submit"
            disabled={choosing || !templateId || (selectedTemplate?.category === "MINECRAFT" && !version)}
            className="btn-primary w-full py-3.5 text-[15px]"
          >
            {choosing ? "만드는 중..." : "이 종류로 서버 만들기"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-16">
      <h1 className="text-2xl font-bold">서버 만들기</h1>
      <p className="text-sm text-text-dim mt-1">
        먼저 플랜을 정하고 결제하면, 그다음에 서버 종류와 버전을 골라요.
      </p>

      <form onSubmit={submitOrder} className="mt-8 space-y-10">
        {/* 1. 이름 */}
        <Section step={1} title="서버 이름">
          <div className="flex gap-2">
            <input
              required
              maxLength={24}
              className="input w-full"
              placeholder="예: 친구들 SMP"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setServerName(randomServerName())}
              className="btn-secondary px-3.5 shrink-0 inline-flex items-center gap-1.5 text-sm"
              title="무작위 이름 추천"
            >
              <Dices size={16} /> 추천
            </button>
          </div>
        </Section>

        {/* 2. 플랜 */}
        <Section step={2} title="플랜 선택">
          <div className="grid gap-2.5">
            {products.map((p) => {
              const active = productId === p.id;
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setProductId(p.id)}
                  className={`text-left rounded-2xl border p-4 flex items-center justify-between gap-3 transition-all duration-150 ${
                    active
                      ? "border-accent bg-accent/[0.08] shadow-[0_0_0_1px_var(--accent)]"
                      : "border-border bg-surface hover:border-accent/40 hover:bg-surface-2"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <RadioDot active={active} />
                    <div className="min-w-0">
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-text-dim text-xs mt-0.5">
                        RAM {(p.ramMb / 1024).toFixed(0)}GB
                      </div>
                    </div>
                  </div>
                  <span className={`font-bold shrink-0 ${active ? "text-accent" : ""}`}>
                    {p.priceMonthlyKrw.toLocaleString()}원<span className="text-xs font-normal text-text-dim">/월</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        {/* 3. 쿠폰 / 입금자명 */}
        <Section step={3} title="추가 정보 (선택)">
          <div className="space-y-3">
            <input
              className="input w-full"
              placeholder="쿠폰 코드가 있다면 입력하세요"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
            />
            <div>
              <input
                className="input w-full"
                placeholder="입금자명 — 비워두면 자동 생성"
                maxLength={5}
                value={depositorName}
                onChange={(e) => setDepositorName(e.target.value.replace(/\s+/g, ""))}
              />
              <p className="text-xs text-text-dim mt-1.5">공백 없이 1~5자. 입금 시 이 이름으로 보내야 자동 확인돼요.</p>
            </div>
          </div>
        </Section>

        {error && (
          <p className="text-sm text-red bg-red/10 border border-red/30 rounded-xl px-3.5 py-2.5">{error}</p>
        )}

        <button type="submit" disabled={loading || !productId} className="btn-primary w-full py-3.5 text-[15px]">
          {loading ? "처리 중..." : "결제하기"}
        </button>
      </form>
    </div>
  );
}

function Section({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-5 h-5 rounded-full bg-accent/15 text-accent text-[11px] font-bold flex items-center justify-center shrink-0">
          {step}
        </span>
        <h2 className="font-semibold text-[15px]">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function RadioDot({ active }: { active: boolean }) {
  return (
    <span
      className={`w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
        active ? "border-accent" : "border-border"
      }`}
    >
      {active && <span className="w-2 h-2 rounded-full bg-accent" />}
    </span>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-text-dim">{label}</span>
      <span className={highlight ? "font-bold text-accent" : "font-medium"}>{value}</span>
    </div>
  );
}
