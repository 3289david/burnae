import { NextResponse } from "next/server";
import { PterodactylError } from "./pterodactyl/shared";

/**
 * Pterodactyl API 호출(레이트리밋, 타임아웃, 서버 미준비 등)이나 그 밖의 예상치 못한 예외가
 * 라우트 핸들러 밖으로 그대로 터지면 Next.js가 body 없는/JSON이 아닌 500 응답을 내려주고,
 * 프론트엔드의 `await res.json()`이 "Unexpected end of JSON input"으로 깨진다.
 * 모든 서버 API 라우트는 이 래퍼로 감싸서 항상 파싱 가능한 JSON 에러를 돌려주게 한다.
 */
export function withApiErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof PterodactylError) {
        const message =
          err.status === 429
            ? "지금 요청이 몰려서 처리하지 못했어요. 잠시 후 다시 시도해주세요."
            : err.status === 404
              ? "요청한 파일이나 자원을 찾을 수 없어요."
              : err.status === 409
                ? "서버가 아직 준비되지 않았어요. 잠시 후 다시 시도해주세요."
                : err.message;
        const status = err.status >= 400 && err.status < 600 ? err.status : 502;
        return NextResponse.json({ error: message }, { status });
      }
      console.error("[api] 처리되지 않은 오류:", err);
      return NextResponse.json(
        { error: "서버에 일시적인 문제가 발생했어요. 잠시 후 다시 시도해주세요." },
        { status: 500 },
      );
    }
  };
}
