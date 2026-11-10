"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import CountUp from "@/components/CountUp";

/**
 * AI 사용은 더 이상 별도 크레딧이 아니라 통합 포인트에서 바로 차감된다 — 이 카드는 그 포인트
 * 잔액을 보여주고, 부족하면 포인트 충전 페이지(새 탭)로 보낸다. 컴포넌트/파일 이름은 예전
 * 그대로 두되(AiTab.tsx에서 그대로 쓰고 있어서) 내용만 포인트 기준으로 바꿨다.
 */
export default function AiCreditsCard() {
  const [points, setPoints] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/points/balance")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setPoints(data.points));
  }, []);

  return (
    <div className="card-glow p-4 mb-3 animate-fade-up">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Sparkles size={18} className="text-purple shrink-0" />
          <div>
            <p className="text-sm font-medium">AI 사용 포인트</p>
            <p className="text-xs text-text-dim">
              보유 포인트{" "}
              {points === null ? "-" : <CountUp value={points} format={(n) => n.toLocaleString("en-US", { maximumFractionDigits: 0 })} />}P
              <span className="ml-2 text-[11px] text-text-dim/80">(기본 챗 무료, 메이커만 차감)</span>
            </p>
          </div>
        </div>
        <button
          onClick={() => window.open("/points-purchase", "_blank")}
          className="btn-secondary px-3.5 py-1.5 text-xs shrink-0 active:scale-95 transition-transform"
        >
          충전
        </button>
      </div>
    </div>
  );
}
