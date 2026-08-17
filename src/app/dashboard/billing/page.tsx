import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "입금 대기",
  PAID: "결제 완료",
  CANCELLED: "취소됨",
  EXPIRED: "만료됨",
  REFUNDED: "환불됨",
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
      <h1 className="text-2xl font-bold">결제 내역</h1>

      <div className="mt-6 space-y-2">
        {orders.map((o) => (
          <div key={o.id} className="card p-4 flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="font-medium text-sm">
                {TYPE_LABEL[o.type]} · {o.product.name}
                {o.server && ` (${o.server.name})`}
              </p>
              <p className="text-xs text-text-dim mt-0.5">
                {o.createdAt.toLocaleString("ko-KR")} · 입금자명 {o.depositorName}
                {o.discountKrw > 0 && ` · 할인 ${o.discountKrw.toLocaleString()}원`}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-sm">{o.amountKrw.toLocaleString()}원</p>
              <p className={`text-xs ${o.status === "PAID" ? "text-green" : o.status === "PENDING" ? "text-yellow" : "text-text-dim"}`}>
                {STATUS_LABEL[o.status]}
              </p>
            </div>
          </div>
        ))}
        {orders.length === 0 && <p className="text-sm text-text-dim">아직 결제 내역이 없어요.</p>}
      </div>
    </div>
  );
}
