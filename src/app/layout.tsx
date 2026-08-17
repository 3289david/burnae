import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Burnae — 마인크래프트 호스팅",
  description: "빠르게 만들고, AI로 쉽게 관리하는 마인크래프트 서버 호스팅",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`h-full antialiased ${spaceGrotesk.variable}`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
