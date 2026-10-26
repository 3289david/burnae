import { notFound } from "next/navigation";
import { marked } from "marked";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/prisma";
import BrandMark from "@/components/BrandMark";
import Footer from "@/components/Footer";

export default async function BlogPostPage({ params }: PageProps<"/[locale]/blog/[slug]">) {
  const { locale, slug } = await params;
  const post = await prisma.blogPost.findUnique({ where: { slug } });
  if (!post || !post.published) notFound();

  const title = post.titleKr || post.titleEn || "";
  const body = post.bodyKr || post.bodyEn || "";
  const html = await marked.parse(body);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <Link href="/" className="inline-flex items-center gap-2 text-lg font-bold font-display">
            <BrandMark size={22} /> Burnae
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 flex-1 w-full">
        <Link href="/blog" className="text-sm text-accent hover:underline">
          ← 블로그 목록
        </Link>
        <h1 className="text-3xl font-bold font-display mt-4">{title}</h1>
        {post.publishedAt && (
          <p className="text-sm text-text-dim mt-2">
            {new Date(post.publishedAt).toLocaleDateString("ko-KR")}
          </p>
        )}

        <article
          className="prose-sm mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:font-display [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:text-sm [&_p]:text-text-dim [&_p]:leading-relaxed [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ul]:text-sm [&_ul]:text-text-dim [&_table]:w-full [&_table]:text-sm [&_table]:border-collapse [&_table]:my-4 [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:bg-surface-2 [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_a]:text-accent [&_a]:hover:underline [&_strong]:text-text [&_code]:font-mono [&_code]:text-xs [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </main>

      <Footer />
    </div>
  );
}
