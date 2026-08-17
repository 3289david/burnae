import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const q = new URL(request.url).searchParams.get("q")?.trim();

  const servers = await prisma.server.findMany({
    where: {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { owner: { email: { contains: q, mode: "insensitive" } } },
              { owner: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      node: { select: { name: true, location: true } },
      product: { select: { name: true } },
      subdomains: { select: { subdomain: true }, orderBy: { isPrimary: "desc" } },
    },
    take: 200,
  });

  return NextResponse.json(servers);
}
