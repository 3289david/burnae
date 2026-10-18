import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { routing } from "@/i18n/routing";
import "../globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

const METADATA_BY_LOCALE = {
  kr: {
    MINECRAFT_ONLY: { title: "Burnae — 마인크래프트 호스팅", description: "빠르게 만들고, AI로 쉽게 관리하는 마인크래프트 서버 호스팅" },
    GENERAL_ONLY: { title: "Burnae — 서버 호스팅", description: "VPS부터 디스코드 봇 호스팅까지 — 빠르게 만들고, AI로 쉽게 관리하세요" },
    DEFAULT: { title: "Burnae — 마인크래프트·서버 호스팅", description: "마인크래프트부터 VPS, 디스코드 봇 호스팅까지 — 빠르게 만들고, AI로 쉽게 관리하세요" },
  },
  en: {
    MINECRAFT_ONLY: { title: "Burnae — Minecraft Hosting", description: "Create fast, manage easily with AI — Minecraft server hosting" },
    GENERAL_ONLY: { title: "Burnae — Server Hosting", description: "From VPS to Discord bot hosting — create fast, manage easily with AI" },
    DEFAULT: { title: "Burnae — Minecraft & Server Hosting", description: "From Minecraft to VPS and Discord bot hosting — create fast, manage easily with AI" },
  },
} as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const lang = locale === "en" ? "en" : "kr";
  const settings = await prisma.hostingSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  const key = settings.siteMode === "MINECRAFT_ONLY" || settings.siteMode === "GENERAL_ONLY" ? settings.siteMode : "DEFAULT";
  return METADATA_BY_LOCALE[lang][key];
}

const THEME_INIT_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem("burnae-theme");
    if (t === "light") document.documentElement.setAttribute("data-theme", "light");
  } catch (e) {}
})();
`;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function RootLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as "kr" | "en")) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  const htmlLang = locale === "en" ? "en" : "ko";

  return (
    <html lang={htmlLang} data-scroll-behavior="smooth" className={`h-full antialiased ${spaceGrotesk.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
