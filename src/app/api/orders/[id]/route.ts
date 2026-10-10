import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { provisionNewServerOrder } from "@/lib/orderFulfillment";
import { withApiErrorHandling } from "@/lib/apiHandler";
import { getRequiredCustomVariables, type EggVariableSchemaEntry } from "@/lib/eggVariableSchema";

export const GET = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
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
            select: { id: true, key: true, displayName: true, minecraftVersions: true, category: true, defaultEnvironment: true, availableDockerImages: true, variableSchema: true },
          },
        },
      },
    },
  });
  if (!order) return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(order);
});

const selectTemplateSchema = z.object({
  templateId: z.string(),
  minecraftVersion: z.string().optional(),
  gitRepo: z.string().url().max(300).optional(),
  dockerImage: z.string().max(300).optional(),
  presetId: z.string().optional(),
  customVariables: z.record(z.string(), z.string().max(500)).optional(),
});

/**
 * 결제 후 서버 종류/버전 선택. 결제는 끝났지만 아직 서버가 안 만들어진 주문에서만 쓸 수 있다.
 * (서버 종류를 고른 뒤 프로비저닝이 실패해도(예: egg 필수 변수 누락, Pterodactyl 연결 오류)
 * order.serverId는 비어있으므로 templateIdRequested만으로 막지 않고 다시 시도할 수 있게 한다 —
 * 전에는 한 번 실패하면 영원히 "이미 선택한 주문"으로 막혀서 재시도 자체가 불가능했다.)
 */
export const POST = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
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
  if (order.serverId) {
    return NextResponse.json({ error: "이미 서버가 만들어진 주문이에요." }, { status: 409 });
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
  const dockerImage = parsed.data.dockerImage || undefined;
  if (dockerImage && (!availableImages || !Object.values(availableImages).includes(dockerImage))) {
    return NextResponse.json({ error: "선택할 수 없는 런타임 버전입니다." }, { status: 422 });
  }

  let presetId: string | undefined;
  if (parsed.data.presetId) {
    const preset = await prisma.userPreset.findFirst({
      where: { id: parsed.data.presetId, baseTemplateId: selectedTemplate.id, delisted: false },
    });
    if (!preset) {
      return NextResponse.json({ error: "선택할 수 없는 프리셋입니다." }, { status: 422 });
    }
    presetId = preset.id;
  }

  const requiredVars = getRequiredCustomVariables(
    selectedTemplate.variableSchema as EggVariableSchemaEntry[] | null,
    selectedTemplate.defaultEnvironment as Record<string, unknown>,
    selectedTemplate.category,
  );
  const customVariables: Record<string, string> = {};
  for (const v of requiredVars) {
    const value = parsed.data.customVariables?.[v.envVariable]?.trim();
    if (!value) {
      return NextResponse.json(
        { error: `"${v.name}" 값을 입력해주세요.${v.description ? ` (${v.description})` : ""}` },
        { status: 422 },
      );
    }
    customVariables[v.envVariable] = value;
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      templateIdRequested: parsed.data.templateId,
      minecraftVersionRequested: parsed.data.minecraftVersion,
      gitRepoRequested: templateSupportsGitRepo ? parsed.data.gitRepo : undefined,
      dockerImageRequested: availableImages ? dockerImage : undefined,
      presetIdRequested: presetId,
      customVariables: requiredVars.length > 0 ? customVariables : undefined,
    },
  });

  await provisionNewServerOrder(order.id);

  const refreshed = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    select: { id: true, status: true, serverId: true, preorderWaiting: true },
  });
  return NextResponse.json(refreshed);
});
