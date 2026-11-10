"use client";

import { useTranslations } from "next-intl";
import { Coins } from "lucide-react";

/** 포인트 충전 — 클릭하면 전용 페이지를 새 탭으로 연다(모달로 카드 안에서 띄우지 않음).
 * 결제 자체도 그 탭 안에서 끝까지 진행된다(대시보드 레이아웃 밖의 /points-purchase). */
export default function PointsPurchaseCard() {
  const t = useTranslations("pointsPurchaseCard");

  return (
    <div className="card-glow p-4 mb-3 animate-fade-up">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Coins size={18} className="text-yellow shrink-0" />
          <div>
            <p className="text-sm font-medium">{t("title")}</p>
            <p className="text-xs text-text-dim">{t("subtitle")}</p>
          </div>
        </div>
        <button
          onClick={() => window.open("/points-purchase", "_blank")}
          className="btn-secondary px-3.5 py-1.5 text-xs shrink-0 active:scale-95 transition-transform"
        >
          {t("open")}
        </button>
      </div>
    </div>
  );
}
