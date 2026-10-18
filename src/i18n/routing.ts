import { defineRouting } from "next-intl/routing";

/**
 * URL 접두사는 사용자가 명시적으로 요청한 대로 /kr, /en을 쓴다(표준 ISO 코드인 "ko"가 아님) —
 * next-intl의 locale 값 자체는 ISO 코드일 필요가 없고 그냥 라우트 세그먼트 이름일 뿐이라
 * 문제 없다. 실제 Intl.NumberFormat/DateTimeFormat에 넘길 때는 반드시 "ko-KR"/"en-US"로
 * 변환해서 써야 한다(localeToIntlTag 참고) — "kr"은 유효한 BCP-47 언어 태그가 아니다.
 */
export const routing = defineRouting({
  locales: ["kr", "en"],
  defaultLocale: "kr",
  localePrefix: "always",
});

export type AppLocale = (typeof routing.locales)[number];

/** next-intl 라우트 locale("kr"/"en")을 실제 Intl API용 BCP-47 태그로 변환한다 */
export function localeToIntlTag(locale: string): string {
  return locale === "en" ? "en-US" : "ko-KR";
}
