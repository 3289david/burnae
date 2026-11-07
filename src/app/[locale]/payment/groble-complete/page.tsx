"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import SuccessCheck from "@/components/SuccessCheck";
import BrandMark from "@/components/BrandMark";

/**
 * groble.im 콘솔의 "이동 페이지"(결제 완료 후 리다이렉트)에 등록하는 고정 URL.
 * groble의 리다이렉트는 주문 ID 등 아무 정보도 안 실어주므로(문서 확인함), /api/orders/latest-groble로
 * "방금 이 세션으로 groble 결제한 가장 최근 주문"을 역으로 찾아서 바로 서버 구성 화면으로 보낸다.
 */
export default function GrobleCompletePage() {
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/orders/latest-groble")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { id: string; serverId: string | null } | null) => {
        if (!data) {
          setTarget("/dashboard");
          return;
        }
        setTarget(data.serverId ? `/dashboard/servers/${data.serverId}` : `/dashboard/servers/new?orderId=${data.id}`);
      })
      .catch(() => setTarget("/dashboard"));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="flex items-center gap-2 text-lg font-bold font-display justify-center mb-6">
          <BrandMark /> Burnae
        </div>
        <div className="card-glow p-8 text-center space-y-4">
          <SuccessCheck size={48} confetti />
          <p className="font-semibold">결제가 완료됐어요!</p>
          <button
            onClick={() => target && router.push(target)}
            disabled={!target}
            className="btn-primary w-full px-5 py-2.5 text-sm disabled:opacity-50"
          >
            {target ? "서버 구성하기" : "불러오는 중..."}
          </button>
        </div>
      </div>
    </div>
  );
}
