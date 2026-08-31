import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { authorizeServerAccess } from "@/lib/serverAccess";
import { renewResourceUpgradeGrant, ResourceUpgradeRenewalError } from "@/lib/resourceUpgrades";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; grantId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id, grantId } = await params;
  const access = await authorizeServerAccess(user, id);
  if (!access) return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  if (access.ownerId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "서버 소유자만 갱신할 수 있어요." }, { status: 403 });
  }

  try {
    const grant = await renewResourceUpgradeGrant(prisma, grantId, id);
    return NextResponse.json(grant);
  } catch (err) {
    if (err instanceof ResourceUpgradeRenewalError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }
}
