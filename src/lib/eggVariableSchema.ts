import { SECRET_ENV_KEYS, MINECRAFT_VERSION_ENV_ALIASES } from "@/lib/provisioning";

export interface EggVariableSchemaEntry {
  envVariable: string;
  name: string;
  description: string;
  rules: string;
}

/** defaultEnvironment에 빈 값("")이고 Pterodactyl이 "required"로 표시한 변수는 주문 시점에
 * 사용자가 직접 입력해야 서버 생성이 가능하다 — 봇 토큰, API 키처럼 서버마다 달라야 하는 값들.
 * 단, 마인크래프트 버전(드롭다운)/GIT_ADDRESS(저장소 입력)/비밀번호류(자동 생성)처럼 이미 다른
 * 전용 UI나 로직이 채워주는 키는 중복으로 또 입력받지 않도록 제외한다. */
export function getRequiredCustomVariables(
  variableSchema: EggVariableSchemaEntry[] | null | undefined,
  defaultEnvironment: Record<string, unknown>,
  category?: "MINECRAFT" | "DISCORD_BOT" | "GENERAL",
): EggVariableSchemaEntry[] {
  if (!variableSchema) return [];
  const handledElsewhere = new Set<string>([...SECRET_ENV_KEYS, "GIT_ADDRESS"]);
  if (category === "MINECRAFT") {
    for (const key of MINECRAFT_VERSION_ENV_ALIASES) handledElsewhere.add(key);
  }
  return variableSchema.filter((entry) => {
    if (handledElsewhere.has(entry.envVariable)) return false;
    const isRequired = entry.rules?.split("|").includes("required");
    const defaultValue = defaultEnvironment[entry.envVariable];
    const hasDefault = typeof defaultValue === "string" ? defaultValue.trim() !== "" : defaultValue != null;
    return isRequired && !hasDefault;
  });
}
