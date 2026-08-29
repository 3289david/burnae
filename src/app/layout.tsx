import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import { prisma } from "@/lib/prisma";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await prisma.hostingSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  if (settings.siteMode === "MINECRAFT_ONLY") {
    return {
      title: "Burnae — 마인크래프트 호스팅",
      description: "빠르게 만들고, AI로 쉽게 관리하는 마인크래프트 서버 호스팅",
    };
  }
  if (settings.siteMode === "GENERAL_ONLY") {
    return {
      title: "Burnae — 서버 호스팅",
      description: "VPS부터 디스코드 봇 호스팅까지 — 빠르게 만들고, AI로 쉽게 관리하세요",
    };
  }
  return {
    title: "Burnae — 마인크래프트·서버 호스팅",
    description: "마인크래프트부터 VPS, 디스코드 봇 호스팅까지 — 빠르게 만들고, AI로 쉽게 관리하세요",
  };
}

const THEME_INIT_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem("burnae-theme");
    if (t === "light") document.documentElement.setAttribute("data-theme", "light");
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" data-scroll-behavior="smooth" className={`h-full antialiased ${spaceGrotesk.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
