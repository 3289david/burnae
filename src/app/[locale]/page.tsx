import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight, ArrowUpRight, Check, Gift, Plus, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatMb } from "@/lib/formatSize";
import { DiscordLogo } from "@/components/ProviderIcons";
import Footer from "@/components/Footer";
import SiteHeader from "@/components/SiteHeader";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import CountUp from "@/components/CountUp";
import TiltCard from "@/components/TiltCard";
import Image from "next/image";
import FeatureShowcase from "@/components/landing/FeatureShowcase";
import { AiMock, DashboardWide, ConsoleMock, EditorMock, PlayersMock, DepositMock, CreatedMock } from "@/components/landing/Mocks";
import { allowedCategoriesForSiteMode, type SiteMode } from "@/lib/siteMode";
import { getUsdPerKrw, formatUsdApprox } from "@/lib/fxRate";

type T = Awaited<ReturnType<typeof getTranslations<"home">>>;

function featureList(t: T, mode: SiteMode) {
  const order =
    mode === "MINECRAFT_ONLY"
      ? ["create", "console", "mcAi", "mcPlayers", "mcPlugins", "backup", "subdomain", "team"]
      : mode === "GENERAL_ONLY"
        ? ["create", "console", "genAi", "genEnv", "genDeploy", "backup", "subdomain", "team"]
        : ["create", "console", "mcPlayers", "genEnv", "mcPlugins", "backup", "subdomain", "team"];
  return order.map((key) => ({
    key,
    title: t(`features.${key}.title`),
    desc: t(`features.${key}.desc`),
  }));
}

function stepsList(t: T, mode: SiteMode) {
  const planDesc = t("steps.planDescGeneral");
  return [
    { n: 1, title: t("steps.planTitle"), desc: planDesc },
    { n: 2, title: t("steps.depositTitle"), desc: t("steps.depositDesc") },
    { n: 3, title: t("steps.autoCreateTitle"), desc: t("steps.autoCreateDesc") },
    { n: 4, title: t("steps.connectTitle"), desc: t("steps.connectDesc") },
  ];
}

function faqList(t: T, mode: SiteMode) {
  const base = [
    { q: t("faq.refundQ"), a: t("faq.refundA") },
    { q: t("faq.aiControlQ"), a: t("faq.aiControlA") },
  ];
  const minecraft = { q: t("faq.minecraftQ"), a: t("faq.minecraftA") };
  const general = { q: t("faq.generalQ"), a: t("faq.generalA") };
  const payment = { q: t("faq.paymentQ"), a: t("faq.paymentA") };
  if (mode === "MINECRAFT_ONLY") return [...base, minecraft, payment];
  if (mode === "GENERAL_ONLY") return [...base, general, payment];
  return [...base, minecraft, general, payment];
}

async function loadLandingData() {
  try {
    const settings = await prisma.hostingSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
    const categories = allowedCategoriesForSiteMode("GENERAL_ONLY");

    const [rawProducts, events] = await Promise.all([
      prisma.product.findMany({
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        include: {
          allowedTemplates: { where: { active: true, category: { in: categories } }, select: { displayName: true } },
        },
      }),
      prisma.event.findMany({
        where: { active: true, startsAt: { lte: new Date() }, endsAt: { gte: new Date() } },
        orderBy: { startsAt: "desc" },
        take: 1,
        include: { coupon: true },
      }),
    ]);
    const products = rawProducts.filter((p) => p.allowedTemplates.length > 0);
    return { products, events, siteMode: settings.siteMode };
  } catch (err) {
    // DB에 잠깐 문제가 있어도 랜딩페이지 자체는 항상 떠야 한다
    console.error("[landing] 상품/이벤트 조회 실패:", err);
    return { products: [], events: [], siteMode: "MINECRAFT_ONLY" as SiteMode };
  }
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
      <span className="w-1.5 h-1.5 rounded-full bg-accent" /> {children}
    </p>
  );
}

function SectionHead({ label, title, desc }: { label: string; title: string; desc?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <h2 className="mt-4 text-[clamp(1.9rem,4vw,3.25rem)] font-semibold leading-[1.1] tracking-tight">{title}</h2>
      {desc && <p className="mt-4 text-text-dim leading-relaxed max-w-md">{desc}</p>}
    </div>
  );
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  await params;
  const t = await getTranslations("home");
  const user = await getCurrentUser().catch(() => null);
  const { products, events } = await loadLandingData();
  // 랜딩은 VPS·디스코드 봇 호스팅 중심 — 관리자 사이트 모드와 무관하게 일반 서버 문구만 쓴다
  const siteMode: SiteMode = "GENERAL_ONLY";
  const usdPerKrw = null;
  const discordInviteUrl = process.env.NEXT_PUBLIC_DISCORD_SERVER_INVITE_URL;
  const heroTitle = t("hero.titleGeneral");
  const heroDesc = t("hero.descGeneral");
  const FEATURES = featureList(t, siteMode);
  const STEPS = stepsList(t, siteMode);
  const FAQ = faqList(t, siteMode);
  const aiExample = { user: t("aiShowcase.exampleUserGeneral"), ai: t("aiShowcase.exampleAiGeneral"), server: "discord-bot-01", kind: "VPS" };

  const presets = [
    { id: "bot", title: t("presets.bot"), desc: t("presets.botDesc") },
    { id: "vps", title: t("presets.vps"), desc: t("presets.vpsDesc") },
    { id: "deploy", title: t("presets.deploy"), desc: t("presets.deployDesc") },
  ];

  return (
    <div className="min-h-screen">
      <SiteHeader loggedIn={!!user} />
      <AnnouncementBanner maxWidthClass="max-w-7xl" />

      <main>
        {/* ── 히어로 ─────────────────────────────────── */}
        <section className="border-b border-border">
          <div className="wrap-wide grid lg:grid-cols-[1fr_1.05fr] gap-12 lg:gap-16 items-center py-14 sm:py-20 lg:py-28">
            <div>
              {events[0] && (
                <Link href="#pricing" className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-xs mb-6 hover:border-accent transition-colors">
                  <Gift size={13} className="text-accent" />
                  {events[0].title}
                  {events[0].coupon && <span className="font-mono text-accent">{events[0].coupon.code}</span>}
                </Link>
              )}
              <Label>Burnae · VPS · Discord Bot</Label>
              <h1 className="mt-5 text-[clamp(2.3rem,5vw,4.5rem)] font-semibold leading-[1.04] tracking-tight">
                {heroTitle},
                <br />
                {t("hero.titleGradient")} {t("hero.titleEra")}
              </h1>
              <p className="mt-6 text-text-dim text-base sm:text-lg leading-relaxed max-w-lg">{heroDesc}</p>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                <Link href="/register" className="btn-light rounded-lg px-6 py-3 text-sm inline-flex items-center gap-2" style={{ borderRadius: 8 }}>
                  {t("hero.ctaPrimary")} <ArrowRight size={16} />
                </Link>
                {discordInviteUrl && (
                  <a href={discordInviteUrl} target="_blank" rel="noreferrer" className="text-sm text-text-dim hover:text-text inline-flex items-center gap-1.5">
                    <DiscordLogo size={16} /> {t("hero.ctaDiscord")} <ArrowUpRight size={14} />
                  </a>
                )}
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-text-dim">
                {[t("hero.trustNoCard"), t("hero.trustNoSignup"), t("hero.trustCancelAnytime")].map((x) => (
                  <li key={x} className="inline-flex items-center gap-1.5"><Check size={13} className="text-accent" /> {x}</li>
                ))}
              </ul>
            </div>

            {/* 제품 화면 목업 */}
            <TiltCard className="rounded-xl">
              <AiMock {...aiExample} applyLabel={t("aiShowcase.applyButton")} />
            </TiltCard>
          </div>
        </section>

        {/* ── 대시보드 미리보기 ─────────────────────── */}
        <section className="border-b border-border">
          <div className="wrap-wide py-10 sm:py-16">
            <DashboardWide />
          </div>
        </section>

        {/* ── 서버 종류 ─────────────────────────────── */}
        {presets.length > 0 && (
          <section className="border-b border-border">
            <div className="wrap-wide py-16 sm:py-24">
              <SectionHead label="Servers" title={t("presets.title")} desc={t("presets.subtitle")} />
              <div className="mt-12 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                {presets.map((p) => (
                  <Link key={p.id} href="/register" className="group block">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius)] border border-border bg-[#141414]">
                      <Image src={`/img/illus-${p.id}.webp`} alt="" fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                    </div>
                    <div className="mt-4 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-lg">{p.title}</h3>
                        <p className="mt-1 text-sm text-text-dim">{p.desc}</p>
                      </div>
                      <ArrowUpRight size={18} className="text-text-dim shrink-0 mt-1 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── 기능 ──────────────────────────────────── */}
        <section id="features" className="scroll-mt-16 border-b border-border bg-surface/50">
          <div className="wrap-wide py-16 sm:py-24">
            <SectionHead label={`Features 01—${String(FEATURES.length).padStart(2, "0")}`} title={t("features.title")} desc={t("features.subtitle")} />
            <div className="mt-12 sm:mt-16">
              <FeatureShowcase features={FEATURES} ai={{ ...aiExample, applyLabel: t("aiShowcase.applyButton") }} />
            </div>
          </div>
        </section>

        {/* ── 작동 방식 ─────────────────────────────── */}
        <section id="steps" className="scroll-mt-16 border-b border-border">
          <div className="wrap-wide py-16 sm:py-24 grid lg:grid-cols-[1fr_1.4fr] gap-12 lg:gap-24">
            <div>
              <SectionHead label="How it works" title={t("steps.title")} desc={t("steps.subtitle")} />
            </div>
            <div>
              <ol className="border-t border-border">
                {STEPS.map((s) => (
                  <li key={s.n} className="flex gap-5 sm:gap-8 py-6 border-b border-border">
                    <span className="text-xs text-accent font-mono pt-1 w-6 shrink-0">{String(s.n).padStart(2, "0")}</span>
                    <div>
                      <h3 className="font-semibold text-lg">{s.title}</h3>
                      <p className="mt-1.5 text-sm text-text-dim leading-relaxed">{s.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-8 grid sm:grid-cols-2 gap-4"><DepositMock /><CreatedMock /></div>
            </div>
          </div>
        </section>

        {/* ── AI ───────────────────────────────────── */}
        <section className="border-b border-border bg-surface/50">
          <div className="wrap-wide py-16 sm:py-24 grid lg:grid-cols-[1fr_1.4fr] gap-12 lg:gap-24 items-start">
            <SectionHead label={t("aiShowcase.badge")} title={t("aiShowcase.title")} />
            <div className="rounded-xl border border-border bg-surface p-6 sm:p-7 flex gap-4">
              <span className="shrink-0 w-9 h-9 rounded-full bg-green/15 text-green flex items-center justify-center"><ShieldCheck size={18} /></span>
              <p className="text-text-dim leading-relaxed">{t("aiShowcase.desc")}</p>
            </div>
          </div>
        </section>

        {/* ── 가격 (비회원 열람 가능) ────────────────── */}
        <section id="pricing" className="scroll-mt-16 border-b border-border">
          <div className="wrap-wide py-16 sm:py-24">
            <SectionHead label="Pricing · KRW / Month" title={t("pricing.title")} desc={t("pricing.subtitle")} />

            {products.length === 0 ? (
              <p className="mt-10 text-text-dim text-sm">{t("pricing.comingSoon")}</p>
            ) : (
              <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {products.map((p, i) => (
                  <div key={p.id} className={`rounded-xl border bg-surface p-6 flex flex-col ${i === 1 ? "border-accent" : "border-border"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-lg">{p.name}</h3>
                      {i === 1 && <span className="text-[11px] font-semibold text-accent border border-accent/40 rounded-full px-2.5 py-0.5">{t("pricing.popular")}</span>}
                    </div>
                    {p.description && <p className="text-sm text-text-dim mt-1.5 leading-relaxed">{p.description}</p>}
                    <p className="mt-6 text-3xl sm:text-4xl font-semibold tracking-tight">
                      <CountUp value={p.priceMonthlyKrw} duration={900} /><span className="text-sm font-normal text-text-dim ml-0.5">{t("pricing.perMonth")}</span>
                    </p>
                    {usdPerKrw !== null && (
                      <p className="text-xs text-text-dim mt-0.5">{formatUsdApprox(p.priceMonthlyKrw, usdPerKrw)}/mo</p>
                    )}
                    <ul className="mt-6 space-y-2.5 text-sm flex-1 border-t border-border pt-5">
                      <SpecRow label={`RAM ${formatMb(p.ramMb)}`} />
                      <SpecRow label={t("pricing.cpuLabel", { percent: p.cpuPercent })} />
                      <SpecRow label={t("pricing.diskLabel", { size: formatMb(p.diskMb) })} />
                      <SpecRow label={t("pricing.trafficUnlimited")} />
                      <SpecRow label={t("pricing.backupLabel", { count: p.backupSlots })} />
                      {p.pointsPerMonth > 0 && <SpecRow label={t("pricing.aiCreditsLabel", { count: p.pointsPerMonth })} />}
                      {p.priceMonthlyKrw > 0 && <SpecRow label={t("pricing.multiAddressLabel")} />}
                    </ul>
                    <Link href="/register" className={`${i === 1 ? "btn-light" : "btn-ghost"} w-full py-2.5 text-sm mt-7 inline-flex items-center justify-center gap-1.5`} style={{ borderRadius: 8 }}>
                      {t("pricing.startPlan")} <ArrowUpRight size={14} />
                    </Link>
                  </div>
                ))}
              </div>
            )}

            {products.length > 0 && (
              <p className="mt-5 text-xs text-text-dim">
                {t("pricing.fairUseNote")}{" "}
                <Link href="/legal/fair-use" className="text-accent hover:underline">{t("pricing.fairUseLink")}</Link>
                {t("pricing.fairUseNoteEnd")}
              </p>
            )}

            <div className="mt-12 grid md:grid-cols-2 rounded-xl border border-border overflow-hidden bg-surface">
              <div className="p-7 sm:p-10 flex flex-col justify-center">
                <Label>{t("pricing.freeBadge")}</Label>
                <h3 className="mt-4 text-2xl sm:text-3xl font-semibold tracking-tight">{t("pricing.freeTitle")}</h3>
                <p className="mt-4 text-sm text-text-dim leading-relaxed">{t("pricing.freeDesc")}</p>
                <Link href="/register" className="btn-light mt-7 self-start px-6 py-3 text-sm inline-flex items-center gap-1.5" style={{ borderRadius: 8 }}>
                  {t("pricing.freeCta")} <ArrowUpRight size={14} />
                </Link>
              </div>
              <div className="relative min-h-60 md:min-h-full md:border-l border-border bg-[#141414]"><Image src="/img/illus-free.webp" alt="" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" /></div>
            </div>
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────── */}
        <section id="faq" className="scroll-mt-16 border-b border-border bg-surface/50">
          <div className="wrap-wide py-16 sm:py-24 grid lg:grid-cols-[1fr_1.4fr] gap-12 lg:gap-24">
            <SectionHead label="FAQ" title={t("faq.title")} />
            <div className="border-t border-border">
              {FAQ.map((item) => (
                <details key={item.q} className="group border-b border-border">
                  <summary className="py-5 font-medium cursor-pointer list-none flex items-center justify-between gap-4">
                    {item.q}
                    <Plus size={18} className="text-text-dim shrink-0 transition-transform group-open:rotate-45" />
                  </summary>
                  <p className="pb-5 text-sm text-text-dim leading-relaxed max-w-xl">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── 마무리 CTA ────────────────────────────── */}
        <section>
          <div className="wrap-wide py-16 sm:py-24 grid md:grid-cols-2 gap-10 items-center">
            <div>
              <Label>Burnae Hosting</Label>
              <h2 className="mt-4 text-[clamp(2rem,4.6vw,3.75rem)] font-semibold leading-[1.08] tracking-tight">{t("finalCta.title")}</h2>
              <p className="mt-4 text-text-dim">{t("finalCta.desc")}</p>
              <Link href="/register" className="btn-light mt-8 px-7 py-3.5 text-sm inline-flex items-center gap-2" style={{ borderRadius: 8 }}>
                {t("finalCta.cta")} <ArrowUpRight size={15} />
              </Link>
            </div>
            <div className="relative aspect-[16/10] overflow-hidden rounded-[var(--radius)] border border-border bg-[#141414]"><Image src="/img/illus-cta.webp" alt="" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover object-[50%_30%]" /></div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function SpecRow({ label }: { label: string }) {
  return (
    <li className="flex items-start gap-2 text-text-dim">
      <Check size={14} className="text-accent shrink-0 mt-0.5" />
      {label}
    </li>
  );
}
