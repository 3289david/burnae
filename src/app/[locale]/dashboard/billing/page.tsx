import ArtCallout from "@/components/ArtCallout";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Receipt } from "lucide-react";
import BillingOrderRow from "@/components/BillingOrderRow";

const TYPE_LABEL: Record<string, string> = {
  NEW_SERVER: "서버 생성",
  RENEWAL: "갱신",
  UPGRADE: "플랜 변경",
  AI_CREDITS: "AI 크레딧 충전",
  POINTS: "포인트 충전",
};

export default async function BillingPage() {
  const user = await getCurrentUser();
  const orders = await prisma.order.findMany({
    where: { userId: user!.id },
    orderBy: { createdAt: "desc" },
    include: { product: true, server: { select: { name: true } } },
  });

  return (
    <div>
      <PageHeader art="billing" title="결제 내역" desc="서버 결제와 충전 내역이에요." />

      <div className="mt-6 space-y-2.5 max-w-4xl">
        {orders.map((o) => {
          const titleText = `${TYPE_LABEL[o.type] ?? o.type}${
            o.type === "AI_CREDITS"
              ? ` · ${o.aiCreditsAmount?.toLocaleString() ?? 0}개`
              : o.type === "POINTS"
                ? ` · ${o.pointsAmount?.toLocaleString() ?? 0}P`
                : ` · ${o.productNameSnapshot ?? o.product?.name ?? "삭제된 상품"}`
          }${o.server ? ` (${o.server.name})` : ""}`;
          return (
            <BillingOrderRow
              key={o.id}
              order={{
                id: o.id,
                status: o.status,
                preorderWaiting: o.preorderWaiting,
                amountKrw: o.amountKrw,
                depositorName: o.depositorName,
                discountKrw: o.discountKrw,
                createdAtText: o.createdAt.toLocaleString("ko-KR"),
                titleText,
              }}
            />
          );
        })}
        {orders.length === 0 && (
          <div className="card animate-fade-up"><EmptyState art="empty-receipt" title="아직 결제 내역이 없어요." /></div>
        )}
      </div>
      <ArtCallout className="mt-8 max-w-4xl" src="head-support" title="결제가 보이지 않나요?" desc="입금 후에도 반영되지 않으면 고객지원에 남겨주세요." href="/dashboard/support" cta="고객지원 가기" />
    </div>
  );
}
