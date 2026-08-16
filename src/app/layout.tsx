import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Burnae — 마인크래프트 호스팅",
  description: "빠르게 만들고, AI로 쉽게 관리하는 마인크래프트 서버 호스팅",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
