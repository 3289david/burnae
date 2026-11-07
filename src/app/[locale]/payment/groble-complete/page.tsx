"use client";

import SuccessCheck from "@/components/SuccessCheck";
import BrandMark from "@/components/BrandMark";

/**
 * groble.im 콘솔의 "이동 페이지"(결제 완료 후 리다이렉트)에 등록하는 고정 URL.
 * groble의 리다이렉트는 주문 ID 등 아무 정보도 안 실어주므로(문서 확인함), 이 화면은
 * "결제 자체는 끝났다"는 안내만 하고 실제 체결 확인은 원래 결제 창(pay/[orderId])의 폴링 +
 * 웹훅(src/app/api/webhooks/groble)에 맡긴다 — 창을 2개 띄우는 구조(원래 결제 창은 그대로
 * 열어두고, "groble로 결제하기" 버튼이 이 흐름 전체를 새 창에서 연다)라서 이 창은 닫아도 된다.
 */
export default function GrobleCompletePage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="flex items-center gap-2 text-lg font-bold font-display justify-center mb-6">
          <BrandMark /> Burnae
        </div>
        <div className="card-glow p-8 text-center space-y-4">
          <SuccessCheck size={48} confetti />
          <p className="font-semibold">결제가 완료됐어요!</p>
          <p className="text-sm text-text-dim">이 창은 닫아도 돼요.</p>
          <button onClick={() => window.close()} className="btn-primary px-5 py-2.5 text-sm">
            창 닫기
          </button>
        </div>
      </div>
    </div>
  );
}
