import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import "../globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Burnae — VPS·디스코드 봇 호스팅",
  description: "1분 만에 만들고, 채팅 한 줄로 관리하는 VPS·디스코드 봇 호스팅",
};

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
  if (locale !== "kr") notFound();
  setRequestLocale("kr");
  const messages = await getMessages();
  const htmlLang = "ko";

  return (
    <html lang={htmlLang} data-scroll-behavior="smooth" className={`min-h-full antialiased ${spaceGrotesk.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
