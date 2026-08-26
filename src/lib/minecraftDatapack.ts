/**
 * 마인크래프트 데이터팩은 pack_format 숫자와 폴더 구조(1.21+에서 함수/전리품 등 폴더가
 * 단수→복수로 바뀜)가 버전마다 다르다. AI가 만든 데이터팩을 "서버 버전에 자동으로 맞춰서"
 * 적용하기 위한 최소한의 버전 인식 로직.
 *
 * pack_format 표는 Minecraft Wiki 기준 잘 알려진 값들이다. 이 표에 없는(더 최신) 버전은
 * 가장 가까운 값으로 추정하고, pack.mcmeta에 supported_formats 범위를 넉넉히 잡아서
 * "다른 버전용 팩" 경고가 뜨더라도 대부분 실제로는 로드되게 방어한다.
 */

const PACK_FORMAT_TABLE: { maxVersion: string; format: number; pluralFolders: boolean }[] = [
  { maxVersion: "1.14.4", format: 4, pluralFolders: false },
  { maxVersion: "1.16.1", format: 5, pluralFolders: false },
  { maxVersion: "1.16.5", format: 6, pluralFolders: false },
  { maxVersion: "1.17.1", format: 7, pluralFolders: false },
  { maxVersion: "1.18.1", format: 8, pluralFolders: false },
  { maxVersion: "1.18.2", format: 9, pluralFolders: false },
  { maxVersion: "1.19.2", format: 10, pluralFolders: false },
  { maxVersion: "1.19.3", format: 12, pluralFolders: false },
  { maxVersion: "1.19.4", format: 13, pluralFolders: false },
  { maxVersion: "1.20.1", format: 15, pluralFolders: false },
  { maxVersion: "1.20.2", format: 18, pluralFolders: false },
  { maxVersion: "1.20.4", format: 22, pluralFolders: false },
  { maxVersion: "1.20.6", format: 41, pluralFolders: false },
  { maxVersion: "1.21.1", format: 48, pluralFolders: true },
  { maxVersion: "1.21.3", format: 57, pluralFolders: true },
  { maxVersion: "1.21.4", format: 61, pluralFolders: true },
];

function parseVersion(v: string): number[] {
  return v.split(".").map((n) => parseInt(n, 10) || 0);
}

function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export interface DatapackVersionInfo {
  packFormat: number;
  /** 1.21+ 데이터팩은 data/<네임스페이스>/function, recipe 등 폴더명이 복수형(functions, recipes...)으로 바뀜 */
  pluralFolders: boolean;
  /** pack.mcmeta에 넣을 지원 범위 — 표에 없는 최신 버전이라 추정치를 썼을 때 오차를 흡수 */
  supportedFormats: { min_inclusive: number; max_inclusive: number };
}

/** server.minecraftVersion(예: "1.21.1", "latest")을 보고 데이터팩 버전 정보를 추정한다 */
export function resolveDatapackVersion(minecraftVersion: string): DatapackVersionInfo {
  const version = /^\d+\.\d+/.test(minecraftVersion) ? minecraftVersion : "1.21.4"; // "latest" 등은 최신으로 가정

  let match = PACK_FORMAT_TABLE.find((row) => compareVersions(version, row.maxVersion) <= 0);
  if (!match) {
    // 표에 없는 더 최신 버전 — 가장 최근 알려진 값으로 추정 (확인 필요할 수 있음)
    match = PACK_FORMAT_TABLE[PACK_FORMAT_TABLE.length - 1];
  }

  return {
    packFormat: match.format,
    pluralFolders: match.pluralFolders,
    supportedFormats: {
      min_inclusive: Math.max(1, match.format - 10),
      max_inclusive: match.format + 10,
    },
  };
}

/** 데이터팩 하위 폴더 이름(단수/복수)을 서버 버전에 맞게 돌려준다 (예: "function" 또는 "functions") */
export function datapackFolderName(kind: "function" | "recipe" | "loot_table" | "advancement", pluralFolders: boolean): string {
  if (!pluralFolders) return kind;
  const plural: Record<string, string> = {
    function: "functions",
    recipe: "recipes",
    loot_table: "loot_tables",
    advancement: "advancements",
  };
  return plural[kind];
}

export function buildPackMcmeta(description: string, versionInfo: DatapackVersionInfo): string {
  return JSON.stringify(
    {
      pack: {
        pack_format: versionInfo.packFormat,
        supported_formats: versionInfo.supportedFormats,
        description,
      },
    },
    null,
    2,
  );
}
