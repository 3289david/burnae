import { defineRouting } from "next-intl/routing";

/**
 * URL 접두사는 사용자가 명시적으로 요청한 대로 /kr, /en을 쓴다(표준 ISO 코드인 "ko"가 아님) —
 * next-intl의 locale 값 자체는 ISO 코드일 필요가 없고 그냥 라우트 세그먼트 이름일 뿐이라
 * 문제 없다. 실제 Intl.NumberFormat/DateTimeFormat에 넘길 때는 반드시 "ko-KR"/"en-US"로
 * 변환해서 써야 한다(localeToIntlTag 참고) — "kr"은 유효한 BCP-47 언어 태그가 아니다.
 */
export const routing = defineRouting({
  locales: ["kr"],
  defaultLocale: "kr",
  // 로케일이 "kr" 하나뿐이라 "as-needed"면 기본 로케일(=유일한 로케일)엔 접두사를 절대 안 붙인다 —
  // burnae.kr/kr/... 이 아니라 burnae.kr/...로 바로 보이게 하려고 always에서 바꿨다. 실제 페이지
  // 트리는 여전히 app/[locale]/* 밑에 있으니(프록시가 내부적으로 /kr로 rewrite) 그대로 둔다.
  localePrefix: "as-needed",
});

export type AppLocale = (typeof routing.locales)[number];

/** next-intl 라우트 locale("kr")을 실제 Intl API용 BCP-47 태그로 변환한다 */
export function localeToIntlTag(_locale?: string): string {
  return "ko-KR";
}

