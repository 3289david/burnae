/**
 * Modrinth 공개 API 연동 — 플러그인/모드 검색 및 설치.
 * https://docs.modrinth.com/api/ (인증 불필요, User-Agent 권장)
 */

const MODRINTH_BASE = "https://api.modrinth.com/v2";
const USER_AGENT = "burnae.kr/1.0 (contact: support@burnae.kr)";

export type ContentType = "plugin" | "mod";

/** Burnae 서버 종류(egg key) → Modrinth loader 값 매핑 */
const LOADER_MAP: Record<string, string> = {
  paper: "paper",
  purpur: "purpur",
  spigot: "spigot",
  bukkit: "bukkit",
  fabric: "fabric",
  forge: "forge",
  neoforge: "neoforge",
  quilt: "quilt",
};

const PLUGIN_LOADERS = new Set(["paper", "purpur", "spigot", "bukkit", "folia"]);

export function loaderForTemplateKey(templateKey: string): string | null {
  return LOADER_MAP[templateKey] ?? null;
}

export function contentTypeForLoader(loader: string): ContentType {
  return PLUGIN_LOADERS.has(loader) ? "plugin" : "mod";
}

interface ModrinthSearchHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  icon_url: string | null;
  downloads: number;
  categories: string[];
  project_type: string;
}

export interface SearchResult {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  iconUrl: string | null;
  downloads: number;
}

async function modrinthFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${MODRINTH_BASE}${path}`, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Modrinth API 오류 (${res.status})`);
  return res.json();
}

export async function searchProjects(params: {
  query: string;
  loader: string;
  gameVersion?: string;
  limit?: number;
}): Promise<SearchResult[]> {
  const type = contentTypeForLoader(params.loader);
  const facets = [[`project_type:${type}`], [`categories:${params.loader}`]];
  if (params.gameVersion) facets.push([`versions:${params.gameVersion}`]);

  const search = new URLSearchParams({
    query: params.query,
    facets: JSON.stringify(facets),
    limit: String(params.limit ?? 20),
  });

  const res = await modrinthFetch<{ hits: ModrinthSearchHit[] }>(`/search?${search.toString()}`);
  return res.hits.map((h) => ({
    projectId: h.project_id,
    slug: h.slug,
    title: h.title,
    description: h.description,
    iconUrl: h.icon_url,
    downloads: h.downloads,
  }));
}

export interface ModrinthVersion {
  id: string;
  versionNumber: string;
  name: string;
  gameVersions: string[];
  loaders: string[];
  primaryFile: { url: string; filename: string; size: number } | null;
}

export async function getVersions(params: {
  projectId: string;
  loader: string;
  gameVersion?: string;
}): Promise<ModrinthVersion[]> {
  const query = new URLSearchParams({ loaders: JSON.stringify([params.loader]) });
  if (params.gameVersion) query.set("game_versions", JSON.stringify([params.gameVersion]));

  interface RawVersion {
    id: string;
    version_number: string;
    name: string;
    game_versions: string[];
    loaders: string[];
    files: { url: string; filename: string; size: number; primary: boolean }[];
  }
  const versions = await modrinthFetch<RawVersion[]>(
    `/project/${params.projectId}/version?${query.toString()}`,
  );

  return versions.map((v) => {
    const primary = v.files.find((f) => f.primary) ?? v.files[0];
    return {
      id: v.id,
      versionNumber: v.version_number,
      name: v.name,
      gameVersions: v.game_versions,
      loaders: v.loaders,
      primaryFile: primary ? { url: primary.url, filename: primary.filename, size: primary.size } : null,
    };
  });
}

export async function getVersionById(versionId: string): Promise<ModrinthVersion> {
  interface RawVersion {
    id: string;
    version_number: string;
    name: string;
    game_versions: string[];
    loaders: string[];
    files: { url: string; filename: string; size: number; primary: boolean }[];
  }
  const v = await modrinthFetch<RawVersion>(`/version/${versionId}`);
  const primary = v.files.find((f) => f.primary) ?? v.files[0];
  return {
    id: v.id,
    versionNumber: v.version_number,
    name: v.name,
    gameVersions: v.game_versions,
    loaders: v.loaders,
    primaryFile: primary ? { url: primary.url, filename: primary.filename, size: primary.size } : null,
  };
}

/** 버전의 대표 파일(.jar)을 실제로 다운로드한다 */
export async function downloadVersionFile(file: { url: string }): Promise<ArrayBuffer> {
  const res = await fetch(file.url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error("파일 다운로드에 실패했습니다.");
  return res.arrayBuffer();
}
