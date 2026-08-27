import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Receipt } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "입금 대기",
  PAID: "결제 완료",
  CANCELLED: "취소됨",
  EXPIRED: "만료됨",
  REFUNDED: "환불됨",
};
const STATUS_COLOR: Record<string, string> = {
  PENDING: "var(--yellow)",
  PAID: "var(--green)",
  CANCELLED: "var(--text-dim)",
  EXPIRED: "var(--red)",
  REFUNDED: "var(--blue)",
};
const TYPE_LABEL: Record<string, string> = {
  NEW_SERVER: "서버 생성",
  RENEWAL: "갱신",
  UPGRADE: "플랜 변경",
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
        {orders.map((o, i) => {
          const statusText = o.preorderWaiting ? "선주문 대기중" : STATUS_LABEL[o.status];
          const color = o.preorderWaiting ? "var(--yellow)" : STATUS_COLOR[o.status];
          return (
            <div
              key={o.id}
              className="card-glow p-4 flex items-center justify-between flex-wrap gap-2 animate-fade-up"
              style={{ animationDelay: `${Math.min(i, 8) * 0.04}s` }}
            >
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">
                  {TYPE_LABEL[o.type]} · {o.productNameSnapshot ?? o.product?.name ?? "삭제된 상품"}
                  {o.server && ` (${o.server.name})`}
                </p>
                <p className="text-xs text-text-dim mt-0.5">
                  {o.createdAt.toLocaleString("ko-KR")} · 입금자명 {o.depositorName}
                  {o.discountKrw > 0 && ` · 할인 ${o.discountKrw.toLocaleString()}원`}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold text-sm">{o.amountKrw.toLocaleString()}원</p>
                <span
                  className="inline-block mt-1 text-[11px] font-medium rounded-full px-2.5 py-0.5"
                  style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
                >
                  {statusText}
                </span>
              </div>
            </div>
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
