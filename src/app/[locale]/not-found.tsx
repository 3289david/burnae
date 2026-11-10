import { Link } from "@/i18n/navigation";
import SiteHeader from "@/components/SiteHeader";
import EmptyState from "@/components/EmptyState";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center px-4">
        <EmptyState art="404" title="페이지를 찾을 수 없어요" desc="주소가 바뀌었거나 삭제된 페이지예요.">
          <Link href="/" className="btn-light px-6 py-3 text-sm inline-flex">홈으로</Link>
        </EmptyState>
      </main>
    </div>
  );
}
