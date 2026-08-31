import type { SiteMode, ServerCategory } from "@/generated/prisma/client";

export type { SiteMode, ServerCategory };

/** 현재 사이트 모드에서 고객에게 노출해도 되는 서버 종류(카테고리) 목록 */
export function allowedCategoriesForSiteMode(mode: SiteMode): ServerCategory[] {
  if (mode === "MINECRAFT_ONLY") return ["MINECRAFT"];
  if (mode === "GENERAL_ONLY") return ["DISCORD_BOT", "GENERAL"];
  return ["MINECRAFT", "DISCORD_BOT", "GENERAL"];
}
