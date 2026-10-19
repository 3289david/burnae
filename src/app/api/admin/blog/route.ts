import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/auth";

export async function GET() {
  const admin = await requireAdminRole(["GENERAL", "SUPER"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const posts = await prisma.blogPost.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(posts);
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const schema = z.object({
  slug: z.string().min(1).max(80).regex(SLUG_RE, "소문자/숫자/하이픈만 쓸 수 있어요."),
  titleKr: z.string().min(1).max(200),
  excerptKr: z.string().max(400).optional().nullable(),
  bodyKr: z.string().min(1),
  titleEn: z.string().max(200).optional().nullable(),
  excerptEn: z.string().max(400).optional().nullable(),
  bodyEn: z.string().optional().nullable(),
  published: z.boolean().default(false),
});

export async function POST(request: Request) {
  const admin = await requireAdminRole(["GENERAL", "SUPER"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." }, { status: 422 });
  }

  const dup = await prisma.blogPost.findUnique({ where: { slug: parsed.data.slug } });
  if (dup) return NextResponse.json({ error: "이미 쓰이는 슬러그예요." }, { status: 409 });

  const post = await prisma.blogPost.create({
    data: {
      ...parsed.data,
      authorUserId: admin.id,
      publishedAt: parsed.data.published ? new Date() : null,
    },
  });
  return NextResponse.json(post);
}
