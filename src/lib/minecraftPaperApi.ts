import fs from "node:fs/promises";
import path from "node:path";

/**
 * 컴파일된(.jar) Bukkit/Paper 플러그인을 만들려면 그 API를 컴파일 타임에 링크해야 한다.
 * PaperMC의 공개 Maven 저장소에서 서버 버전에 맞는 paper-api jar를 찾아 한 번만 내려받고
 * 로컬에 캐싱해서 재사용한다. (papermc.io는 Paper 공식 저장소 — 고정된 신뢰 호스트)
 */

const MAVEN_BASE = "https://repo.papermc.io/repository/maven-public/io/papermc/paper/paper-api";
const CACHE_DIR = path.join(process.cwd(), ".cache", "paper-api");

async function fetchAllVersions(): Promise<string[]> {
  const res = await fetch(`${MAVEN_BASE}/maven-metadata.xml`);
  if (!res.ok) throw new Error("Paper API 버전 목록을 가져오지 못했습니다.");
  const xml = await res.text();
  const versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]);
  return versions;
}

/** "1.21.4" 같은 순정 버전 문자열을 Paper의 Maven 버전 식별자로 매칭한다 */
function matchMavenVersion(minecraftVersion: string, versions: string[]): string {
  const exact = versions.find((v) => v === `${minecraftVersion}-R0.1-SNAPSHOT`);
  if (exact) return exact;

  // 정확히 없으면(너무 최신이거나 프리릴리즈) 같은 마이너 버전 중 가장 안정적인 것을 고른다
  const sameMinor = versions.filter((v) => v.startsWith(`${minecraftVersion}-`) && v.includes("R0.1"));
  if (sameMinor.length > 0) return sameMinor[sameMinor.length - 1];

  // 그래도 없으면 R0.1-SNAPSHOT 계열 중 가장 마지막(최신) 것으로 대체
  const stable = versions.filter((v) => v.endsWith("R0.1-SNAPSHOT"));
  if (stable.length === 0) throw new Error(`Paper API에서 ${minecraftVersion}에 맞는 버전을 찾지 못했습니다.`);
  return stable[stable.length - 1];
}

async function resolveSnapshotJarUrl(mavenVersion: string): Promise<string> {
  const res = await fetch(`${MAVEN_BASE}/${mavenVersion}/maven-metadata.xml`);
  if (!res.ok) throw new Error(`Paper API(${mavenVersion}) 메타데이터를 가져오지 못했습니다.`);
  const xml = await res.text();

  // classifier가 없는(순수 jar) snapshotVersion 블록만 찾는다 — javadoc/sources는 제외
  const blocks = [...xml.matchAll(/<snapshotVersion>([\s\S]*?)<\/snapshotVersion>/g)].map((m) => m[1]);
  const plainJar = blocks.find(
    (b) => !b.includes("<classifier>") && b.includes("<extension>jar</extension>"),
  );
  if (!plainJar) throw new Error(`Paper API(${mavenVersion}) jar 파일을 찾지 못했습니다.`);
  const value = plainJar.match(/<value>([^<]+)<\/value>/)?.[1];
  if (!value) throw new Error(`Paper API(${mavenVersion}) jar 파일명을 확인하지 못했습니다.`);

  return `${MAVEN_BASE}/${mavenVersion}/paper-api-${value}.jar`;
}

/** 서버 버전에 맞는 Paper API jar를 로컬 경로로 돌려준다 (없으면 받아서 캐싱) */
export async function getPaperApiJarPath(minecraftVersion: string): Promise<string> {
  const version = /^\d+\.\d+/.test(minecraftVersion) ? minecraftVersion : "1.21.4";
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const cachedPath = path.join(CACHE_DIR, `paper-api-${version}.jar`);

  try {
    await fs.access(cachedPath);
    return cachedPath;
  } catch {
    // 캐시에 없음 — 새로 받아야 함
  }

  const versions = await fetchAllVersions();
  const mavenVersion = matchMavenVersion(version, versions);
  const jarUrl = await resolveSnapshotJarUrl(mavenVersion);

  const res = await fetch(jarUrl);
  if (!res.ok) throw new Error("Paper API jar 다운로드에 실패했습니다.");
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(cachedPath, buffer);
  return cachedPath;
}
