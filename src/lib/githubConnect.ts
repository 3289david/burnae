import { exchangeCodeForToken, buildAuthorizeUrl } from "@/lib/oauth";

/** 로그인용 GitHub 연동과 같은 OAuth App(GITHUB_CLIENT_ID/SECRET)을 재사용하지만, 이 흐름은
 * 로그인이 아니라 "비공개 저장소 접근 허용"이 목적이라 repo 범위로 다시 동의를 받는다 —
 * GitHub은 같은 앱이라도 인가 요청마다 다른 scope를 요청할 수 있어서 앱을 새로 만들 필요가 없다. */
const REPO_SCOPE = "repo";
/** 로그인 콜백과 같은 고정 Authorization callback URL을 그대로 쓴다(OAuth App은 콜백 URL을
 * 하나만 등록할 수 있어서) — state 안에 "repo_connect:" 접두사를 넣어서 콜백 라우트가 로그인과
 * 저장소 연동을 구분하게 한다. */
const STATE_PREFIX = "repo_connect:";

export type GithubConnectTarget = { serverId: string } | { returnTo: string };

export function buildGithubConnectState(csrf: string, target: GithubConnectTarget): string {
  const suffix = "serverId" in target ? `server:${target.serverId}` : `return:${encodeURIComponent(target.returnTo)}`;
  return `${STATE_PREFIX}${csrf}:${suffix}`;
}

export function parseGithubConnectState(state: string): GithubConnectTarget | null {
  if (!state.startsWith(STATE_PREFIX)) return null;
  const rest = state.slice(STATE_PREFIX.length);
  const sepIndex = rest.indexOf(":");
  if (sepIndex === -1) return null;
  const tail = rest.slice(sepIndex + 1);
  if (tail.startsWith("server:")) {
    const serverId = tail.slice("server:".length);
    return serverId ? { serverId } : null;
  }
  if (tail.startsWith("return:")) {
    const returnTo = decodeURIComponent(tail.slice("return:".length));
    return returnTo.startsWith("/") ? { returnTo } : null;
  }
  return null;
}

export function buildGithubConnectAuthorizeUrl(state: string): string {
  return buildAuthorizeUrl("github", state, REPO_SCOPE);
}

export async function exchangeGithubConnectCode(code: string): Promise<{ accessToken: string; githubLogin: string }> {
  const accessToken = await exchangeCodeForToken("github", code);
  const res = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "burnae.kr" },
  });
  if (!res.ok) throw new Error("깃허브 프로필 조회 실패");
  const user = await res.json();
  return { accessToken, githubLogin: user.login as string };
}

export interface GithubRepoSummary {
  fullName: string;
  cloneUrl: string;
  private: boolean;
  updatedAt: string;
}

/** 연동된 계정이 접근할 수 있는 저장소 목록(비공개 포함) — 최근 수정 순으로 100개까지.
 * GitHub API는 affiliation(소속 범위)과 sort를 같이 쓰면 여러 조직을 합쳐서 정렬해야 해서
 * 계정에 속한 조직이 많을수록 체감될 만큼 느려진다 — sort는 빼고 받아온 뒤 여기서 직접
 * updated_at 기준으로 정렬한다. 응답이 아예 멈추는 경우를 대비해 타임아웃도 건다. */
export async function fetchGithubRepos(accessToken: string): Promise<GithubRepoSummary[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch("https://api.github.com/user/repos?per_page=100&affiliation=owner,collaborator,organization_member", {
      headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "burnae.kr" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error("저장소 목록 조회 실패");
    const repos = (await res.json()) as { full_name: string; clone_url: string; private: boolean; updated_at: string }[];
    return repos
      .map((r) => ({ fullName: r.full_name, cloneUrl: r.clone_url, private: r.private, updatedAt: r.updated_at }))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("GitHub 응답이 너무 느려서 중단했어요. 잠시 후 다시 시도해주세요.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
