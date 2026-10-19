import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/auth";

const schema = z.object({
  slug: z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  titleKr: z.string().min(1).max(200).optional(),
  excerptKr: z.string().max(400).optional().nullable(),
  bodyKr: z.string().min(1).optional(),
  titleEn: z.string().max(200).optional().nullable(),
  excerptEn: z.string().max(400).optional().nullable(),
  bodyEn: z.string().optional().nullable(),
  published: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminRole(["GENERAL", "SUPER"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.blogPost.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "글을 찾을 수 없습니다." }, { status: 404 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." }, { status: 422 });
  }

  if (parsed.data.slug && parsed.data.slug !== existing.slug) {
    const dup = await prisma.blogPost.findUnique({ where: { slug: parsed.data.slug } });
    if (dup) return NextResponse.json({ error: "이미 쓰이는 슬러그예요." }, { status: 409 });
  }

  const nowPublishing = parsed.data.published && !existing.published;
  const updated = await prisma.blogPost.update({
    where: { id },
    data: {
      ...parsed.data,
      ...(nowPublishing ? { publishedAt: new Date() } : {}),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminRole(["GENERAL", "SUPER"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  await prisma.blogPost.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
