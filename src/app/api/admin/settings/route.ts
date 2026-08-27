import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const settings = await prisma.hostingSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  return NextResponse.json(settings);
}

const schema = z.object({
  ramPricePerGbKrw: z.number().int().min(0).optional(),
  minRamGb: z.number().int().min(1).optional(),
  maxRamGb: z.number().int().min(1).optional(),
  defaultDiskGb: z.number().int().min(1).optional(),
  diskPricePerGbKrw: z.number().int().min(0).optional(),
  defaultBackupSlots: z.number().int().min(0).optional(),
  backupPricePerSlotKrw: z.number().int().min(0).optional(),
  defaultUserStorageGb: z.number().int().min(1).optional(),
  maxCpuPercentPerServer: z.number().int().min(50).optional(),
  siteName: z.string().min(1).optional(),
  siteDomain: z.string().min(1).optional(),
  subdomainZone: z.string().min(1).optional(),
  preorderAutoFulfillEnabled: z.boolean().optional(),
  forcePreorderEnabled: z.boolean().optional(),
});

export async function PUT(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 422 });
  }

  const updated = await prisma.hostingSettings.upsert({
    where: { id: 1 },
    update: parsed.data,
    create: { id: 1, ...parsed.data },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "HOSTING_SETTINGS_UPDATED",
      targetType: "HostingSettings",
      targetId: "1",
      metadata: parsed.data,
    },
  });

  return NextResponse.json(updated);
}
