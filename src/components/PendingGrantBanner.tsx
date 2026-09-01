"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Gift, CheckCircle2, ArrowRight, X } from "lucide-react";

export interface PendingGrant {
  id: string;
  serverNameRequested: string | null;
  isAdminGrant: boolean;
}

export default function PendingGrantBanner({ grant }: { grant: PendingGrant }) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [hidden, setHidden] = useState(false);

  async function cancel(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("지급된 서버를 취소할까요? 나중에 다시 받을 수 없어요.")) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/orders/${grant.id}/cancel`, { method: "POST" });
      if (res.ok) {
        setHidden(true);
        router.refresh();
      }
    } finally {
      setCancelling(false);
    }
  }

  if (hidden) return null;

  return (
    <Link
      href={`/dashboard/servers/new?orderId=${grant.id}`}
      className="relative card-glow mb-4 p-4 flex items-center gap-3 border-accent/40 bg-accent/[0.06] animate-fade-up"
    >
      <span className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
        {grant.isAdminGrant ? <Gift size={17} className="text-accent" /> : <CheckCircle2 size={17} className="text-accent" />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">
          {grant.isAdminGrant ? "지급된 서버가 있어요!" : "결제가 완료됐어요!"}
        </p>
        <p className="text-xs text-text-dim mt-0.5">서버 종류와 버전을 고르면 바로 만들어져요 — {grant.serverNameRequested}</p>
      </div>
      {grant.isAdminGrant && (
        <button
          onClick={cancel}
          disabled={cancelling}
          title="취소하기"
          className="text-text-dim hover:text-red shrink-0 p-1 active:scale-90 transition-transform"
        >
          <X size={16} />
        </button>
      )}
      <ArrowRight size={16} className="text-accent shrink-0" />
    </Link>
  );
}
