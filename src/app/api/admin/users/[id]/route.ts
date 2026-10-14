import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminRole, isSuperAdmin, getAdminEmail } from "@/lib/auth";
import { addDiscordRole, removeDiscordRole } from "@/lib/discordNotify";

const schema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  aiCreditsRemaining: z.number().int().min(0).optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
  adminRole: z.enum(["COMMUNITY", "PROMOTION", "GENERAL", "SUPER"]).nullable().optional(),
});

/** 관리자가 특정 유저의 AI 크레딧/정지 상태를 조정하거나(일반 이상), 관리자 권한을 부여(최고관리자만) */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminRole(["GENERAL", "SUPER"]);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 422 });
  }
  const { role, adminRole, ...rest } = parsed.data;

  // role/adminRole(관리자 권한 부여/회수)은 최고관리자만 — 다른 영역 관리자가 자기 권한을 넓히거나
  // 남에게 넘기는 걸 막는다. getAdminEmail 계정은 역할이 항상 고정이라 변경 대상에서 제외한다.
  if (role !== undefined || adminRole !== undefined) {
    if (!isSuperAdmin(admin)) {
      return NextResponse.json({ error: "관리자 권한 변경은 최고관리자만 할 수 있어요." }, { status: 403 });
    }
    const target = await prisma.user.findUnique({ where: { id } });
    if (target && target.email.toLowerCase() === getAdminEmail()) {
      return NextResponse.json({ error: "이 계정의 권한은 변경할 수 없어요." }, { status: 409 });
    }
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...rest,
      ...(role !== undefined ? { role } : {}),
      ...(adminRole !== undefined ? { adminRole } : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: "USER_UPDATED",
      targetType: "User",
      targetId: id,
      metadata: parsed.data,
    },
  });

  // adminRole이 바뀌었으면 디스코드 역할도 맞춰준다 — purchaserRoleId/customerRoleId와 같은 패턴.
  // 디스코드 연동이 안 돼 있거나 역할 ID가 설정 안 돼 있으면 조용히 무시한다(응답을 막지 않음).
  if (adminRole !== undefined) {
    void (async () => {
      try {
        const [link, botSettings] = await Promise.all([
          prisma.discordLink.findUnique({ where: { userId: id } }),
          prisma.botSettings.findUnique({ where: { id: 1 } }),
        ]);
        const roleId = botSettings?.adminRoleId;
        if (!link || !roleId) return;
        if (adminRole) {
          await addDiscordRole(link.discordUserId, roleId);
        } else {
          await removeDiscordRole(link.discordUserId, roleId);
        }
      } catch (err) {
        console.error("[admin/users] 디스코드 관리자 역할 동기화 실패:", err);
      }
    })();
  }

  return NextResponse.json({ id: user.id, email: user.email, status: user.status, role: user.role, adminRole: user.adminRole });
}
