/**
 * 알려진 마인크래프트 서버 로더/구현체 목록. 새 로더를 지원하려면 이 배열에 한 줄만 추가하면
 * 관리자 템플릿 등록 시 Egg 이름 자동 인식과, AI 플러그인/모드 메이커의 생성 방식 판단에 모두 반영된다.
 *
 * bukkitApi: Bukkit/Spigot 플러그인 API를 제공하는 로더면 true — 순정 Paper/Purpur/Spigot뿐 아니라
 * Forge/Fabric 위에서 Bukkit API를 얹어주는 하이브리드 로더(Arclight, Mohist, Ketting, Banner,
 * Cardboard 등)도 포함된다. 이 경우 실제 컴파일된 자바 플러그인(java_plugin)과 Skript를 쓸 수 있다.
 * false면(순정 Forge/Fabric/NeoForge/Quilt/Vanilla) 바이트코드 리매핑 전용 빌드체계(ForgeGradle/
 * Fabric Loom/NeoGradle)가 있어야만 진짜 모드를 컴파일할 수 있어 지원 범위 밖 — 바닐라 데이터팩만 지원한다.
 */

export interface LoaderInfo {
  key: string;
  label: string;
  match: RegExp;
  bukkitApi: boolean;
  minecraftVersions: string[];
}

// 순서 중요: 더 구체적인(하이브리드) 이름을 그 기반 로더(forge/fabric)보다 먼저 검사해야
// "Arclight (NeoForge)" 같은 Egg 이름이 neoforge/forge로 오분류되지 않는다.
export const KNOWN_LOADERS: LoaderInfo[] = [
  // Forge/NeoForge 기반이지만 Bukkit API를 제공하는 하이브리드
  { key: "arclight", label: "Arclight", match: /arclight/i, bukkitApi: true, minecraftVersions: ["1.20.1", "1.19.2", "1.18.2", "1.16.5", "1.12.2"] },
  { key: "mohist", label: "Mohist", match: /mohist/i, bukkitApi: true, minecraftVersions: ["1.20.1", "1.19.2", "1.18.2", "1.16.5", "1.12.2"] },
  { key: "catserver", label: "CatServer", match: /catserver/i, bukkitApi: true, minecraftVersions: ["1.20.1", "1.18.2", "1.16.5", "1.12.2"] },
  { key: "ketting", label: "Ketting", match: /ketting/i, bukkitApi: true, minecraftVersions: ["1.21.1", "1.20.4", "1.20.1"] },
  // Fabric 기반이지만 Bukkit API를 제공하는 하이브리드
  { key: "cardboard", label: "Cardboard", match: /cardboard/i, bukkitApi: true, minecraftVersions: ["1.20.4", "1.20.1", "1.19.2"] },
  // 순정 모드 로더 — Bukkit API 없음, 바닐라 데이터팩만 지원
  // NeoForge는 "forge" 정규식에도 걸리므로 forge보다 먼저 검사해야 함
  { key: "neoforge", label: "NeoForge", match: /neoforge/i, bukkitApi: false, minecraftVersions: ["1.21.4", "1.21.1", "1.20.6", "1.20.4"] },
  { key: "forge", label: "Forge", match: /forge/i, bukkitApi: false, minecraftVersions: ["1.20.1", "1.19.2", "1.18.2", "1.16.5", "1.12.2"] },
  { key: "fabric", label: "Fabric", match: /fabric/i, bukkitApi: false, minecraftVersions: ["1.21.4", "1.21.1", "1.20.4", "1.20.1", "1.19.2"] },
  { key: "quilt", label: "Quilt", match: /quilt/i, bukkitApi: false, minecraftVersions: ["1.21.1", "1.20.4", "1.20.1"] },
  // 순정 Bukkit 계열
  { key: "paper", label: "Paper", match: /paper/i, bukkitApi: true, minecraftVersions: ["1.21.4", "1.21.1", "1.20.6", "1.20.4", "1.19.4"] },
  { key: "purpur", label: "Purpur", match: /purpur/i, bukkitApi: true, minecraftVersions: ["1.21.4", "1.21.1", "1.20.4"] },
  { key: "spigot", label: "Spigot", match: /spigot/i, bukkitApi: true, minecraftVersions: ["1.21.4", "1.21.1", "1.20.4", "1.19.4"] },
  { key: "bukkit", label: "CraftBukkit", match: /bukkit/i, bukkitApi: true, minecraftVersions: ["1.21.4", "1.21.1", "1.20.4", "1.19.4"] },
  // 그 외
  { key: "vanilla", label: "Vanilla", match: /vanilla/i, bukkitApi: false, minecraftVersions: ["1.21.4", "1.21.1", "1.20.4", "1.19.4", "1.18.2"] },
];

/** 서버 템플릿 key나 Pterodactyl Egg 이름을 보고 알려진 로더면 정보를, 아니면 null을 준다 */
export function findLoaderInfo(text: string): LoaderInfo | null {
  const lower = text.toLowerCase();
  const exact = KNOWN_LOADERS.find((l) => l.key === lower);
  if (exact) return exact;
  return KNOWN_LOADERS.find((l) => l.match.test(text)) ?? null;
}

/** 이 서버 종류가 Bukkit/Spigot 플러그인 API를 제공하는가 (컴파일된 java_plugin + Skript 사용 가능) */
export function hasBukkitApi(templateKey: string): boolean {
  return findLoaderInfo(templateKey)?.bukkitApi ?? false;
}
