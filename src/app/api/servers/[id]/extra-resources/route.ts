import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { PteroApp, PteroClient } from "@/lib/pterodactyl";
import { allocateExtraPort } from "@/lib/provisioning";
import { withApiErrorHandling } from "@/lib/apiHandler";
import { EXTRA_RESOURCE_RENEWAL_DAYS } from "@/lib/resourceUpgrades";
import { logServerActivity } from "@/lib/serverActivityLog";

const schema = z.object({ shopItemId: z.string() });

const EXTRA_KINDS = ["EXTRA_PORT", "EXTRA_SUBDOMAIN"] as const;

/**
 * 포인트로 추가 포트/서브도메인 슬롯을 산다 — free-upgrade(RAM/CPU/DISK/백업슬롯)와 달리
 * 무료 서버 전용이 아니라 소유한 모든 서버에서 쓸 수 있다. RAM/CPU/DISK처럼 영구가 아니라
 * EXTRA_RESOURCE_RENEWAL_DAYS(120일) 시한부로 적용되고, 갱신하지 않으면 크론이 회수한다
 * (추가 포트는 allocation 해제, 추가 서브도메인 슬롯은 초과분 서브도메인을 삭제).
 */
export const POST = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const access = await authorizeServerAccess(user, id);
  if (!access) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (access.ownerId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "서버 소유자만 구매할 수 있어요." }, { status: 403 });
  }

  const server = await prisma.server.findUniqueOrThrow({ where: { id } });
  if (!server.pterodactylServerId || !server.pterodactylIdentifier) {
    return NextResponse.json({ error: "서버가 아직 준비 중입니다." }, { status: 409 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 422 });

  const item = await prisma.shopItem.findUnique({ where: { id: parsed.data.shopItemId, active: true } });
  if (!item || !EXTRA_KINDS.includes(item.kind as (typeof EXTRA_KINDS)[number])) {
    return NextResponse.json({ error: "존재하지 않는 항목입니다." }, { status: 404 });
  }

  const currentTotal = item.kind === "EXTRA_PORT"
    ? (server.extraPorts as { id: number; ip: string; port: number }[]).length
    : server.extraSubdomainSlots;
  if (item.maxTotal != null && currentTotal + 1 > item.maxTotal) {
    return NextResponse.json({ error: "이 항목은 이미 최대치까지 구매했어요." }, { status: 422 });
  }

  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (fresh.promotionPoints < item.pointsCost) {
    return NextResponse.json(
      { error: `포인트가 부족해요. (필요 ${item.pointsCost.toLocaleString()}P, 보유 ${fresh.promotionPoints.toLocaleString()}P)` },
      { status: 422 },
    );
  }

  const expiresAt = new Date(Date.now() + EXTRA_RESOURCE_RENEWAL_DAYS * 24 * 60 * 60 * 1000);

  if (item.kind === "EXTRA_PORT") {
    const node = await prisma.hostNode.findUniqueOrThrow({ where: { id: server.nodeId } });
    // Pterodactyl 호출을 먼저 성공시킨 뒤에야 포인트를 차감한다 — 실패 시 포인트만 빠져나가고
    // 아무 것도 생기지 않는 상황을 방지
    const allocation = await allocateExtraPort(node);
    await PteroApp.addServerAllocation(server.pterodactylServerId, allocation.id);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { promotionPoints: { decrement: item.pointsCost } } });
      const extraPorts = server.extraPorts as { id: number; ip: string; port: number }[];
      await tx.server.update({
        where: { id: server.id },
        data: { extraPorts: [...extraPorts, allocation] },
      });
      await tx.resourceUpgradeGrant.create({
        data: { serverId: server.id, userId: user.id, itemId: item.id, kind: item.kind, amount: 1, expiresAt, metadata: allocation },
      });
      await tx.shopRedemption.create({ data: { userId: user.id, itemId: item.id, pointsSpent: item.pointsCost } });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "SERVER_EXTRA_PORT_PURCHASE",
          targetType: "Server",
          targetId: server.id,
          metadata: { itemId: item.id, pointsSpent: item.pointsCost, allocation },
        },
      });
    });

    await logServerActivity(server.id, user.id, "RESOURCE_UPGRADE", item.name);
    await PteroClient.sendPowerAction(server.pterodactylIdentifier, "restart").catch((err) => {
      console.error("[extra-resources] 재시작 실패(구매 자체는 정상 적용됨):", err);
    });

    return NextResponse.json({ ok: true, pointsSpent: item.pointsCost, port: allocation.port, expiresAt });
  }

  // EXTRA_SUBDOMAIN — 실제 서브도메인 생성은 기존 "주소 추가" 기능에서 하고, 여기서는 슬롯만 늘린다
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { promotionPoints: { decrement: item.pointsCost } } });
    await tx.server.update({ where: { id: server.id }, data: { extraSubdomainSlots: { increment: 1 } } });
    await tx.resourceUpgradeGrant.create({
      data: { serverId: server.id, userId: user.id, itemId: item.id, kind: item.kind, amount: 1, expiresAt },
    });
    await tx.shopRedemption.create({ data: { userId: user.id, itemId: item.id, pointsSpent: item.pointsCost } });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "SERVER_EXTRA_SUBDOMAIN_PURCHASE",
        targetType: "Server",
        targetId: server.id,
        metadata: { itemId: item.id, pointsSpent: item.pointsCost },
      },
    });
  });

  await logServerActivity(server.id, user.id, "RESOURCE_UPGRADE", item.name);

  return NextResponse.json({ ok: true, pointsSpent: item.pointsCost, expiresAt });
});
