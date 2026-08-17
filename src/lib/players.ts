import { PteroClient } from "@/lib/pterodactyl";

/**
 * RCON 없이 실제 콘솔 명령(/whitelist, /op, /ban, /kick, /list)과
 * 서버가 직접 관리하는 JSON 파일(whitelist.json, ops.json, banned-players.json)로
 * 플레이어를 관리한다. 전부 실제 Pterodactyl API 호출 — 가짜 데이터 없음.
 */

export interface WhitelistEntry {
  uuid: string;
  name: string;
}
export interface OpEntry {
  uuid: string;
  name: string;
  level: number;
}
export interface BanEntry {
  uuid?: string;
  name: string;
  reason?: string;
  source?: string;
  expires?: string;
}

async function readJsonFile<T>(identifier: string, file: string): Promise<T[]> {
  try {
    const content = await PteroClient.readFile(identifier, file);
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // 파일이 아직 없으면(한 번도 사용 안 한 서버) 빈 목록으로 취급
    return [];
  }
}

export async function getWhitelist(identifier: string): Promise<WhitelistEntry[]> {
  return readJsonFile<WhitelistEntry>(identifier, "/whitelist.json");
}

export async function getOps(identifier: string): Promise<OpEntry[]> {
  return readJsonFile<OpEntry>(identifier, "/ops.json");
}

export async function getBans(identifier: string): Promise<BanEntry[]> {
  return readJsonFile<BanEntry>(identifier, "/banned-players.json");
}

/** 콘솔에 접속해 "/list" 결과를 파싱해 실제 접속 중인 플레이어 이름을 반환한다 */
export async function getOnlinePlayers(identifier: string): Promise<string[]> {
  const lines = await PteroClient.runCommandAndCapture(identifier, "list", 3000);
  // 예: "There are 3 of a max of 20 players online: Steve, Alex, Notch"
  const match = lines
    .reverse()
    .map((l) => l.match(/There are \d+ of a max(?:imum)? of \d+ players online:?\s*(.*)/i))
    .find((m) => m);
  if (!match) return [];
  const names = match[1]?.trim();
  if (!names) return [];
  return names.split(",").map((n) => n.trim()).filter(Boolean);
}

export async function whitelistAdd(identifier: string, name: string) {
  await PteroClient.sendConsoleCommand(identifier, `whitelist add ${name}`);
}
export async function whitelistRemove(identifier: string, name: string) {
  await PteroClient.sendConsoleCommand(identifier, `whitelist remove ${name}`);
}
export async function whitelistToggle(identifier: string, enabled: boolean) {
  await PteroClient.sendConsoleCommand(identifier, `whitelist ${enabled ? "on" : "off"}`);
}
export async function opPlayer(identifier: string, name: string) {
  await PteroClient.sendConsoleCommand(identifier, `op ${name}`);
}
export async function deopPlayer(identifier: string, name: string) {
  await PteroClient.sendConsoleCommand(identifier, `deop ${name}`);
}
export async function banPlayer(identifier: string, name: string, reason?: string) {
  await PteroClient.sendConsoleCommand(identifier, `ban ${name}${reason ? ` ${reason}` : ""}`);
}
export async function pardonPlayer(identifier: string, name: string) {
  await PteroClient.sendConsoleCommand(identifier, `pardon ${name}`);
}
export async function kickPlayer(identifier: string, name: string, reason?: string) {
  await PteroClient.sendConsoleCommand(identifier, `kick ${name}${reason ? ` ${reason}` : ""}`);
}
