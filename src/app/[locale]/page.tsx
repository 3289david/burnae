import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import {
  Zap, Bot, Terminal, Users, Puzzle, ShieldCheck, Globe, RefreshCw,
  ArrowRight, Check, MessageCircle, Rocket, Gift, KeyRound, FolderGit2,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatMb } from "@/lib/formatSize";
import BrandMark from "@/components/BrandMark";
import { DiscordLogo } from "@/components/ProviderIcons";
import Footer from "@/components/Footer";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import ThemeToggle from "@/components/ThemeToggle";
import DotGrid from "@/components/DotGrid";
import CountUp from "@/components/CountUp";
import { allowedCategoriesForSiteMode, type SiteMode } from "@/lib/siteMode";
import { getUsdPerKrw, formatUsdApprox } from "@/lib/fxRate";

type T = Awaited<ReturnType<typeof getTranslations<"home">>>;

function featureList(t: T, mode: SiteMode) {
  const ICONS: Record<string, { icon: typeof Zap; color: string }> = {
    create: { icon: Zap, color: "var(--accent)" },
    console: { icon: Terminal, color: "var(--cyan)" },
    backup: { icon: RefreshCw, color: "var(--lime)" },
    subdomain: { icon: Globe, color: "var(--flame-2)" },
    team: { icon: ShieldCheck, color: "var(--green)" },
    mcAi: { icon: Bot, color: "var(--purple)" },
    mcPlayers: { icon: Users, color: "var(--blue)" },
    mcPlugins: { icon: Puzzle, color: "var(--pink)" },
    genAi: { icon: Bot, color: "var(--purple)" },
    genEnv: { icon: KeyRound, color: "var(--blue)" },
    genDeploy: { icon: FolderGit2, color: "var(--pink)" },
  };
  const order =
    mode === "MINECRAFT_ONLY"
      ? ["create", "console", "mcAi", "mcPlayers", "mcPlugins", "backup", "subdomain", "team"]
      : mode === "GENERAL_ONLY"
        ? ["create", "console", "genAi", "genEnv", "genDeploy", "backup", "subdomain", "team"]
        : ["create", "console", "mcPlayers", "genEnv", "mcPlugins", "backup", "subdomain", "team"];
  return order.map((key) => ({
    key,
    ...ICONS[key],
    title: t(`features.${key}.title`),
    desc: t(`features.${key}.desc`),
  }));
}

function stepsList(t: T, mode: SiteMode) {
  const planDesc =
    mode === "MINECRAFT_ONLY" ? t("steps.planDescMinecraft") : mode === "GENERAL_ONLY" ? t("steps.planDescGeneral") : t("steps.planDescBoth");
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
    const categories = allowedCategoriesForSiteMode(settings.siteMode);

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

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  const t = await getTranslations("home");
  const user = await getCurrentUser().catch(() => null);
  const { products, events, siteMode } = await loadLandingData();
  const usdPerKrw = null;
  const discordInviteUrl = process.env.NEXT_PUBLIC_DISCORD_SERVER_INVITE_URL;
  const heroTitle = siteMode === "MINECRAFT_ONLY" ? t("hero.titleMinecraft") : siteMode === "GENERAL_ONLY" ? t("hero.titleGeneral") : t("hero.titleBoth");
  const heroDesc = siteMode === "MINECRAFT_ONLY" ? t("hero.descMinecraft") : siteMode === "GENERAL_ONLY" ? t("hero.descGeneral") : t("hero.descBoth");
  const FEATURES = featureList(t, siteMode);
  const STEPS = stepsList(t, siteMode);
  const FAQ = faqList(t, siteMode);
  const aiExample =
    siteMode === "GENERAL_ONLY"
      ? { user: t("aiShowcase.exampleUserGeneral"), ai: t("aiShowcase.exampleAiGeneral") }
      : { user: t("aiShowcase.exampleUserMinecraft"), ai: t("aiShowcase.exampleAiMinecraft") };

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
              <Link href="/dashboard" className="btn-primary px-5 py-2.5 text-sm">{t("nav.dashboard")}</Link>
            ) : (
              <>
                <Link href="/login" className="hidden sm:inline text-sm text-text-dim hover:text-text px-3 py-2">
                  {t("nav.login")}
                </Link>
                <Link href="/register" className="btn-primary px-5 py-2.5 text-sm">{t("nav.start")}</Link>
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
              {heroTitle},
              <br />
              <span className="text-gradient">{t("hero.titleGradient")}</span> {t("hero.titleEra")}
            </h1>
            <p className="mt-6 text-lg text-text-dim max-w-xl mx-auto animate-fade-up" style={{ animationDelay: "0.1s" }}>
              {heroDesc}
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3 animate-fade-up" style={{ animationDelay: "0.2s" }}>
              <Link href="/register" className="btn-primary px-7 py-3.5 text-base inline-flex items-center gap-2">
                {t("hero.ctaPrimary")} <ArrowRight size={18} />
              </Link>
              {discordInviteUrl && (
                <a
                  href={discordInviteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary px-7 py-3.5 text-base inline-flex items-center gap-2 border-purple/40 text-purple hover:bg-purple/10"
                >
                  <DiscordLogo size={18} /> {t("hero.ctaDiscord")}
                </a>
              )}
            </div>

            <div className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-text-dim animate-fade-up" style={{ animationDelay: "0.3s" }}>
              <span className="inline-flex items-center gap-1.5"><Check size={16} className="text-green" /> {t("hero.trustNoCard")}</span>
              <span className="inline-flex items-center gap-1.5"><Check size={16} className="text-green" /> {t("hero.trustNoSignup")}</span>
              <span className="inline-flex items-center gap-1.5"><Check size={16} className="text-green" /> {t("hero.trustCancelAnytime")}</span>
            </div>
          </div>
        </section>

        {/* ── 기능 ──────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center max-w-xl mx-auto">
            <h2 className="text-3xl font-bold font-display">{t("features.title")}</h2>
            <p className="mt-3 text-text-dim">{t("features.subtitle")}</p>
          </div>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f) => (
              <div key={f.key} className="card-glow p-6">
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
            <h2 className="text-3xl font-bold font-display">{t("steps.title")}</h2>
            <p className="mt-3 text-text-dim">{t("steps.subtitle")}</p>
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
                <Bot size={14} /> {t("aiShowcase.badge")}
              </div>
              <h2 className="mt-4 text-2xl sm:text-3xl font-bold font-display">{t("aiShowcase.title")}</h2>
              <p className="mt-3 text-text-dim">{t("aiShowcase.desc")}</p>
            </div>
            <div className="card p-4 space-y-3 bg-bg">
              <ChatBubble from="user">{aiExample.user}</ChatBubble>
              <ChatBubble from="ai">{aiExample.ai}</ChatBubble>
              <div className="flex justify-end">
                <span className="text-xs bg-accent text-white rounded-full px-3 py-1.5 font-medium">{t("aiShowcase.applyButton")}</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── 가격 (비회원 열람 가능) ────────────────── */}
        <section id="pricing" className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center max-w-xl mx-auto">
            <h2 className="text-3xl font-bold font-display">{t("pricing.title")}</h2>
            <p className="mt-3 text-text-dim">{t("pricing.subtitle")}</p>
          </div>

          {products.length === 0 ? (
            <p className="mt-10 text-center text-text-dim text-sm">{t("pricing.comingSoon")}</p>
          ) : (
            <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {products.map((p, i) => (
                <div key={p.id} className={`card-glow p-6 flex flex-col ${i === 1 ? "border-accent" : ""}`}>
                  {i === 1 && (
                    <span className="self-start text-xs font-semibold text-accent bg-accent/10 rounded-full px-3 py-1 mb-3">{t("pricing.popular")}</span>
                  )}
                  <h3 className="font-semibold text-lg font-display">{p.name}</h3>
                  {p.description && (
                    <p className="text-sm text-text-dim mt-1">{p.description}</p>
                  )}
                  <p className="mt-4 text-3xl font-bold font-display">
                    <CountUp value={p.priceMonthlyKrw} duration={900} /><span className="text-base font-normal text-text-dim">{t("pricing.perMonth")}</span>
                  </p>
                  {usdPerKrw !== null && (
                    <p className="text-xs text-text-dim mt-0.5">{formatUsdApprox(p.priceMonthlyKrw, usdPerKrw)}/mo</p>
                  )}
                  <ul className="mt-5 space-y-2 text-sm flex-1">
                    <SpecRow label={`RAM ${formatMb(p.ramMb)}`} />
                    <SpecRow label={t("pricing.cpuLabel", { percent: p.cpuPercent })} />
                    <SpecRow label={t("pricing.diskLabel", { size: formatMb(p.diskMb) })} />
                    <SpecRow label={t("pricing.trafficUnlimited")} />
                    <SpecRow label={t("pricing.backupLabel", { count: p.backupSlots })} />
                    {p.aiCreditsPerMonth > 0 && <SpecRow label={t("pricing.aiCreditsLabel", { count: p.aiCreditsPerMonth })} />}
                    {p.priceMonthlyKrw > 0 && <SpecRow label={t("pricing.multiAddressLabel")} />}
                  </ul>
                  <Link href="/register" className="btn-primary w-full py-2.5 text-sm text-center mt-6">
                    {t("pricing.startPlan")}
                  </Link>
                </div>
              ))}
            </div>
          )}

          {products.length > 0 && (
            <p className="mt-4 text-center text-xs text-text-dim">
              {t("pricing.fairUseNote")}{" "}
              <Link href="/legal/fair-use" className="text-accent hover:underline">
                {t("pricing.fairUseLink")}
              </Link>
              {t("pricing.fairUseNoteEnd")}
            </p>
          )}

          <div className="card-glow mt-8 p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-5 border-accent">
            <div>
              <span className="text-xs font-semibold text-accent bg-accent/10 rounded-full px-3 py-1">{t("pricing.freeBadge")}</span>
              <h3 className="mt-3 text-xl font-bold font-display">{t("pricing.freeTitle")}</h3>
              <p className="mt-2 text-sm text-text-dim max-w-md">{t("pricing.freeDesc")}</p>
            </div>
            <Link href="/register" className="btn-primary px-6 py-3 text-sm shrink-0">
              {t("pricing.freeCta")}
            </Link>
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────── */}
        <section className="max-w-3xl mx-auto px-6 py-20">
          <h2 className="text-3xl font-bold font-display text-center">{t("faq.title")}</h2>
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
            <h2 className="mt-4 text-2xl sm:text-3xl font-bold font-display relative">{t("finalCta.title")}</h2>
            <p className="mt-2 text-text-dim relative">{t("finalCta.desc")}</p>
            <Link href="/register" className="btn-primary px-7 py-3.5 text-base inline-flex items-center gap-2 mt-7 relative">
              {t("finalCta.cta")} <ArrowRight size={18} />
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
