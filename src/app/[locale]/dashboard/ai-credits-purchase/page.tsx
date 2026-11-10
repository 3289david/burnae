"use client";

import { useEffect } from "react";

/** AI 크레딧이 포인트로 통합되면서 이 페이지는 /points-purchase로 옮겨갔다 —
 * 예전 링크를 북마크해둔 사람이 있을 수 있어서 완전히 지우지 않고 리다이렉트만 해둔다. */
export default function AiCreditsPurchaseRedirectPage() {
  useEffect(() => {
    window.location.replace("/points-purchase");
  }, []);
  return null;
}
