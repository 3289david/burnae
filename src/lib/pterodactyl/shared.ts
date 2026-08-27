export class PterodactylError extends Error {
  constructor(
    message: string,
    public status: number,
    public detail?: unknown,
  ) {
    super(message);
    this.name = "PterodactylError";
  }
}

function baseUrl() {
  const url = process.env.PTERODACTYL_URL;
  if (!url) throw new Error("PTERODACTYL_URL 환경변수가 설정되지 않았습니다.");
  return url.replace(/\/+$/, "");
}

async function request<T>(
  apiKey: string | undefined,
  path: string,
  init?: RequestInit,
  raw = false,
): Promise<T> {
  if (!apiKey) throw new Error("Pterodactyl API 키가 설정되지 않았습니다.");

  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();

  // 파일 내용(files/contents)처럼 JSON이 아닌 순수 텍스트를 그대로 돌려주는 엔드포인트용 —
  // server.properties 같은 비-JSON 파일을 JSON.parse 하면 무조건 깨진다.
  if (raw) {
    if (!res.ok) {
      throw new PterodactylError(`Pterodactyl API 요청 실패 (${res.status})`, res.status, text);
    }
    return text as T;
  }

  const body = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const detail = body?.errors ?? body;
    const message =
      body?.errors?.[0]?.detail ?? `Pterodactyl API 요청 실패 (${res.status})`;
    throw new PterodactylError(message, res.status, detail);
  }

  return body as T;
}

export function applicationRequest<T>(path: string, init?: RequestInit) {
  return request<T>(process.env.PTERODACTYL_APPLICATION_API_KEY, path, init);
}

export function clientRequest<T>(path: string, init?: RequestInit, raw = false) {
  return request<T>(process.env.PTERODACTYL_CLIENT_API_KEY, path, init, raw);
}
