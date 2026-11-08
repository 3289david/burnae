import EmptyState from "@/components/EmptyState";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/prisma";
import SiteHeader from "@/components/SiteHeader";
import Footer from "@/components/Footer";

export const metadata = { title: "블로그 — Burnae" };
// 관리자가 글을 새로 올리거나 공개/비공개를 바꾸면 바로 반영돼야 해서 정적 생성 대신 매 요청마다 새로 조회한다
export const revalidate = 0;

export default async function BlogListPage({ params }: PageProps<"/[locale]/blog">) {
  const { locale } = await params;
  const posts = await prisma.blogPost.findMany({
    where: { published: true },
    orderBy: { publishedAt: "desc" },
    select: { slug: true, titleKr: true, titleEn: true, excerptKr: true, excerptEn: true, publishedAt: true },
  });

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />

      <main className="max-w-3xl mx-auto px-6 py-12 flex-1 w-full">
        <h1 className="text-3xl font-bold font-display">블로그</h1>

        <div className="mt-8 space-y-6">
          {posts.map((p) => {
            const title = p.titleKr || p.titleEn || "";
            const excerpt = p.excerptKr ?? p.excerptEn;
            return (
              <Link key={p.slug} href={`/blog/${p.slug}`} className="block card-glow p-5 hover:border-accent/40 transition-colors">
                <h2 className="font-semibold text-lg font-display">{title}</h2>
                {excerpt && <p className="text-sm text-text-dim mt-1.5">{excerpt}</p>}
                {p.publishedAt && (
                  <p className="text-xs text-text-dim mt-2">
                    {new Date(p.publishedAt).toLocaleDateString("ko-KR")}
                  </p>
                )}
              </Link>
            );
          })}
          {posts.length === 0 && (
            <EmptyState title="아직 글이 없어요." />
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
