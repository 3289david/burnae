/**
 * Pterodactyl에서 실제로 가져온 Egg 이름을 보고, 잘 알려진 마인크래프트 서버 종류면
 * 초보자도 바로 쓸 수 있게 key(내부 슬러그)와 버전 목록을 미리 제안해준다.
 * Nest ID/Egg ID/도커 이미지/시작 명령어/환경변수는 어차피 관리자의 실제 Pterodactyl에서
 * 그대로 가져오니, 여기서는 "이름을 보고 뭘 제안할지"만 다룬다.
 */

interface EggPreset {
  key: string;
  /** 흔한 최신 버전부터 나열 — 관리자가 자유롭게 더하거나 뺄 수 있음 */
  minecraftVersions: string[];
}

const PRESETS: { match: RegExp; preset: EggPreset }[] = [
  {
    match: /paper/i,
    preset: { key: "paper", minecraftVersions: ["1.21.4", "1.21.1", "1.20.6", "1.20.4", "1.19.4"] },
  },
  {
    match: /forge/i, // "NeoForge"도 이 패턴에 걸리므로 아래 neoforge를 먼저 매칭시켜야 함
    preset: { key: "forge", minecraftVersions: ["1.20.1", "1.19.2", "1.18.2", "1.16.5", "1.12.2"] },
  },
  {
    match: /fabric/i,
    preset: { key: "fabric", minecraftVersions: ["1.21.4", "1.21.1", "1.20.4", "1.20.1", "1.19.2"] },
  },
  {
    match: /vanilla/i,
    preset: { key: "vanilla", minecraftVersions: ["1.21.4", "1.21.1", "1.20.4", "1.19.4", "1.18.2"] },
  },
  {
    match: /purpur/i,
    preset: { key: "purpur", minecraftVersions: ["1.21.4", "1.21.1", "1.20.4"] },
  },
];

// NeoForge는 "forge" 정규식보다 먼저 검사해야 오분류되지 않는다
const NEOFORGE: { match: RegExp; preset: EggPreset } = {
  match: /neoforge/i,
  preset: { key: "neoforge", minecraftVersions: ["1.21.4", "1.21.1", "1.20.6", "1.20.4"] },
};

/** Pterodactyl Egg 이름(예: "Paper", "Forge Minecraft")을 보고 알려진 종류면 제안값을, 아니면 null을 준다 */
export function matchEggPreset(eggName: string): EggPreset | null {
  if (NEOFORGE.match.test(eggName)) return NEOFORGE.preset;
  for (const { match, preset } of PRESETS) {
    if (match.test(eggName)) return preset;
  }
  return null;
}
