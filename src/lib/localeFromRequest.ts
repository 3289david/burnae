/**
 * API 라우트(app/api/*)는 [locale] 세그먼트 밖에 있어서 next-intl의 locale 컨텍스트가 없다.
 * 리다이렉트를 로그인/대시보드 등 페이지로 보낼 때 쓰는 헬퍼. 겉으로 보이는 URL에는 더 이상
 * /kr 접두사를 안 붙이므로(proxy.ts가 내부적으로만 /kr/*로 rewrite) 경로를 그대로 돌려준다.
 */
export function localizedPath(_localeCookie: string | undefined, path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

