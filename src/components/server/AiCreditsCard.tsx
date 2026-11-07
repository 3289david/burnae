"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import CountUp from "@/components/CountUp";

/** AI 크레딧 충전 — 클릭하면 전용 페이지를 새 탭으로 연다(모달로 카드 안에서 띄우지 않음).
 * 결제 자체도 그 탭 안에서 끝까지 진행된다(ai-credits-purchase/page.tsx). */
export default function AiCreditsCard() {
  const t = useTranslations("aiCreditsCard");
  const [credits, setCredits] = useState<number | null>(null);

  function loadBalance() {
    fetch("/api/ai-credits/balance")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setCredits(data.credits));
  }
  useEffect(loadBalance, []);

  return (
    <div className="card-glow p-4 mb-3 animate-fade-up">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-purple/15 flex items-center justify-center shrink-0">
            <Sparkles size={15} className="text-purple" />
          </span>
          <div>
            <p className="text-sm font-medium">{t("title")}</p>
            <p className="text-xs text-text-dim">
              {t("subtitlePrefix")}{" "}
              {credits === null ? "-" : <CountUp value={credits} format={(n) => n.toLocaleString("en-US", { maximumFractionDigits: 2 })} />} {t("subtitleSuffix")}
              <span className="ml-2 text-[11px] text-text-dim/80">(기본 챗 무료)</span>
            </p>
          </div>
        </div>
        <button
          onClick={() => window.open("/dashboard/ai-credits-purchase", "_blank")}
          className="btn-secondary px-3.5 py-1.5 text-xs shrink-0 active:scale-95 transition-transform"
        >
          {t("open")}
        </button>
      </div>
    </div>
  );
}
