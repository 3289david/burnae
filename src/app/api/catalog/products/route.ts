import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { allowedCategoriesForSiteMode } from "@/lib/siteMode";

export async function GET() {
  const settings = await prisma.hostingSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  const categories = allowedCategoriesForSiteMode(settings.siteMode);

  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    include: { allowedTemplates: { where: { active: true, category: { in: categories } } } },
  });
  // 사이트 모드에서 안 보여주는 카테고리의 템플릿만 있던 상품(예: VPS 전용 상품인데 지금은
  // 마인크래프트만 보여주는 모드)은 고를 수 있는 종류가 하나도 없으니 아예 목록에서 제외
  return NextResponse.json(products.filter((p) => p.allowedTemplates.length > 0));
}
