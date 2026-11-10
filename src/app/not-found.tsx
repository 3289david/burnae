import "./globals.css";
import EmptyState from "@/components/EmptyState";
import BrandMark from "@/components/BrandMark";

export const metadata = { title: "페이지를 찾을 수 없어요 — Burnae" };

export default function RootNotFound() {
  return (
    <html lang="ko">
      <body className="min-h-screen flex flex-col">
        <header className="border-b border-border">
          <div className="wrap-wide h-16 flex items-center">
            <a href="/" className="flex items-center gap-2 text-lg font-bold"><BrandMark size={26} /> Burnae</a>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4">
          <EmptyState art="404" title="페이지를 찾을 수 없어요" desc="주소가 바뀌었거나 삭제된 페이지예요.">
            <a href="/" className="btn-light px-6 py-3 text-sm inline-flex">홈으로</a>
          </EmptyState>
        </main>
      </body>
    </html>
  );
}
