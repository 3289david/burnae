import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { provisionNewServerOrder } from "@/lib/orderFulfillment";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const order = await prisma.order.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      status: true,
      serverId: true,
      amountKrw: true,
      depositorName: true,
      expiresAt: true,
      isPreorder: true,
      preorderWaiting: true,
      templateIdRequested: true,
      productId: true,
      product: {
        select: {
          id: true,
          name: true,
          ramMb: true,
          diskMb: true,
          priceMonthlyKrw: true,
          description: true,
          allowedTemplates: {
            where: { active: true },
            select: { id: true, key: true, displayName: true, minecraftVersions: true, category: true, defaultEnvironment: true, availableDockerImages: true },
          },
        },
      },
    },
  });
  if (!order) return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(order);
}

const selectTemplateSchema = z.object({
  templateId: z.string(),
  minecraftVersion: z.string().optional(),
  gitRepo: z.string().url().max(300).optional(),
  dockerImage: z.string().max(300).optional(),
});

/**
 * 결제 후 서버 종류/버전 선택. 결제는 끝났지만 아직 어떤 서버를 만들지 안 고른 주문에서만 쓸 수 있다.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const order = await prisma.order.findFirst({
    where: { id, userId: user.id },
    include: { product: { include: { allowedTemplates: true } } },
  });
  if (!order) return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  if (order.status !== "PAID") {
    return NextResponse.json({ error: "아직 결제가 완료되지 않았어요." }, { status: 422 });
  }
  if (order.serverId || order.templateIdRequested) {
    return NextResponse.json({ error: "이미 서버 종류를 선택한 주문이에요." }, { status: 409 });
  }
  if (!order.product) {
    return NextResponse.json({ error: "이 주문의 상품이 삭제되어 종류를 선택할 수 없어요. 관리자에게 문의해주세요." }, { status: 409 });
  }

  const parsed = selectTemplateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 422 });
  }
  const selectedTemplate = order.product.allowedTemplates.find((t) => t.id === parsed.data.templateId);
  if (!selectedTemplate) {
    return NextResponse.json({ error: "이 상품에서 선택할 수 없는 서버 종류입니다." }, { status: 422 });
  }
  if (selectedTemplate.category === "MINECRAFT" && !parsed.data.minecraftVersion) {
    return NextResponse.json({ error: "마인크래프트 버전을 선택해주세요." }, { status: 422 });
  }
  const templateSupportsGitRepo = "GIT_ADDRESS" in (selectedTemplate.defaultEnvironment as Record<string, unknown>);
  const availableImages = selectedTemplate.availableDockerImages as Record<string, string> | null;
  if (parsed.data.dockerImage && (!availableImages || !Object.values(availableImages).includes(parsed.data.dockerImage))) {
    return NextResponse.json({ error: "선택할 수 없는 런타임 버전입니다." }, { status: 422 });
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      templateIdRequested: parsed.data.templateId,
      minecraftVersionRequested: parsed.data.minecraftVersion,
      gitRepoRequested: templateSupportsGitRepo ? parsed.data.gitRepo : undefined,
      dockerImageRequested: availableImages ? parsed.data.dockerImage : undefined,
    },
  });

  await provisionNewServerOrder(order.id);

  const refreshed = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    select: { id: true, status: true, serverId: true, preorderWaiting: true },
  });
  return NextResponse.json(refreshed);
}
