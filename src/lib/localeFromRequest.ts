/**
 * API 라우트(app/api/*)는 [locale] 세그먼트 밖에 있어서 next-intl의 locale 컨텍스트가 없다.
 * 리다이렉트를 로그인/대시보드 등 로케일 페이지로 보낼 때 쓰는 쿠키 기반 헬퍼 — 쿠키가 아직
 * 없으면 "kr"로 기본 처리한다(어차피 proxy.ts가 다시 감지해서 맞는 언어로 보내주지만,
 * 쿠키가 있는 경우엔 리다이렉트 한 번으로 바로 맞는 언어 페이지로 가게 해준다).
 */
export function localizedPath(_localeCookie: string | undefined, path: string): string {
  return `/kr${path.startsWith("/") ? path : `/${path}`}`;
}

