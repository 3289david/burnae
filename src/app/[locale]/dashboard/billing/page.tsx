import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Receipt } from "lucide-react";
import BillingOrderRow from "@/components/BillingOrderRow";

const TYPE_LABEL: Record<string, string> = {
  NEW_SERVER: "서버 생성",
  RENEWAL: "갱신",
  UPGRADE: "플랜 변경",
  AI_CREDITS: "AI 크레딧 충전",
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
      <div className="flex items-center gap-3 animate-fade-up">
        <span className="w-11 h-11 rounded-2xl bg-accent/15 flex items-center justify-center shrink-0">
          <Receipt size={20} className="text-accent" />
        </span>
        <h1 className="text-2xl font-bold font-display">결제 내역</h1>
      </div>

      <div className="mt-6 space-y-2.5">
        {orders.map((o) => {
          const titleText = `${TYPE_LABEL[o.type]}${
            o.type === "AI_CREDITS"
              ? ` · ${o.aiCreditsAmount?.toLocaleString() ?? 0}개`
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
          <div className="card-glow p-10 text-center animate-fade-up">
            <p className="text-sm text-text-dim">아직 결제 내역이 없어요.</p>
          </div>
        )}
      </div>
    </div>
  );
}
