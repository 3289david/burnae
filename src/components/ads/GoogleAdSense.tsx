"use client";

import Script from "next/script";

const CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
const SLOT_ID = process.env.NEXT_PUBLIC_ADSENSE_SLOT_ID;

/**
 * 구글 애드센스 — 무료(포인트 교환) 서버 대시보드에만 노출. 실제 승인된 애드센스 계정의
 * client ID/slot ID(NEXT_PUBLIC_ADSENSE_CLIENT_ID / NEXT_PUBLIC_ADSENSE_SLOT_ID)가 .env에
 * 설정되기 전까지는 아무것도 렌더링하지 않는다 — 가짜 ID로 스크립트를 넣으면 계정 자체가
 * 정책 위반으로 막힐 수 있어서, 값이 없으면 조용히 자리만 비워둔다.
 */
export default function GoogleAdSense() {
  if (!CLIENT_ID || !SLOT_ID) return null;

  return (
    <div className="flex justify-center py-1">
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={CLIENT_ID}
        data-ad-slot={SLOT_ID}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
      <Script
        async
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT_ID}`}
        crossOrigin="anonymous"
        strategy="lazyOnload"
        onLoad={() => {
          try {
            (window as unknown as { adsbygoogle: unknown[] }).adsbygoogle =
              (window as unknown as { adsbygoogle: unknown[] }).adsbygoogle || [];
            (window as unknown as { adsbygoogle: unknown[] }).adsbygoogle.push({});
          } catch {
            // 광고 스크립트 로드 실패는 무시 — 페이지 기능에 영향 없음
          }
        }}
      />
    </div>
  );
}
