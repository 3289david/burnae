"use client";

import Script from "next/script";

/**
 * 카카오 애드핏 — 무료(포인트 교환) 서버 대시보드에만 노출한다. 유료 고객 화면에는 절대 넣지 않는다.
 * 페이지 렌더링을 막지 않도록 스크립트는 lazyOnload로 불러오고, 광고 영역은 배너 하나(320x50)로
 * 최소화해서 UI를 침범하지 않게 한다.
 */
export default function FreeTierAd() {
  return (
    <div className="flex justify-center py-1">
      <ins
        className="kakao_ad_area"
        style={{ display: "none" }}
        data-ad-unit="DAN-sW9cZvYpYroTarPH"
        data-ad-width="320"
        data-ad-height="50"
      />
      <Script src="//t1.kakaocdn.net/kas/static/ba.min.js" strategy="lazyOnload" />
    </div>
  );
}
