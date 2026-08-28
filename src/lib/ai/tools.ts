import type OpenAI from "openai";
import { PteroClient } from "@/lib/pterodactyl";
import * as Players from "@/lib/players";
import { prisma } from "@/lib/prisma";
import {
  searchProjects,
  getVersions,
  loaderForTemplateKey,
  contentTypeForLoader,
  downloadVersionFile,
} from "@/lib/modrinth";
import type { Server } from "@/generated/prisma/client";
import type { AiRiskLevel } from "@/generated/prisma/enums";

/**
 * Burnae AI가 사용할 수 있는 유일한 창구.
 * AI는 Docker/Pterodactyl을 직접 호출하지 않고 반드시 이 제한된 Tool만 통과한다.
 * 위험도(riskLevel)에 따라 SAFE는 즉시 실행, 그 외는 사용자 승인 후에만 실행된다.
 */

type JsonSchema = Record<string, unknown>;

export interface ToolDef {
  riskLevel: AiRiskLevel;
  name: string;
  description: string;
  parameters: JsonSchema;
  run: (server: Server, input: Record<string, unknown>) => Promise<unknown>;
}

export const AI_TOOLS: Record<string, ToolDef> = {
  get_server_status: {
    riskLevel: "SAFE",
    name: "get_server_status",
    description: "서버의 현재 상태(온라인 여부, CPU/RAM/디스크 사용량, 가동시간)를 조회한다.",
    parameters: { type: "object", properties: {} },
    run: async (server) => {
      if (!server.pterodactylIdentifier) return { status: "PROVISIONING" };
      return PteroClient.getServerResources(server.pterodactylIdentifier);
    },
  },

  read_recent_console: {
    riskLevel: "SAFE",
    name: "read_recent_console",
    description: "서버 콘솔의 최근 출력 로그를 읽어 오류나 상태를 분석한다.",
    parameters: { type: "object", properties: {} },
    run: async (server) => {
      if (!server.pterodactylIdentifier) return { lines: [] };
      const lines = await PteroClient.captureRecentConsoleOutput(server.pterodactylIdentifier);
      return { lines };
    },
  },

  get_players: {
    riskLevel: "SAFE",
    name: "get_players",
    description: "현재 접속 중인 플레이어, 화이트리스트, OP, 밴 목록을 조회한다.",
    parameters: { type: "object", properties: {} },
    run: async (server) => {
      if (!server.pterodactylIdentifier) return { online: [], whitelist: [], ops: [], bans: [] };
      const identifier = server.pterodactylIdentifier;
      const [online, whitelist, ops, bans] = await Promise.all([
        Players.getOnlinePlayers(identifier).catch(() => []),
        Players.getWhitelist(identifier),
        Players.getOps(identifier),
        Players.getBans(identifier),
      ]);
      return { online, whitelist, ops, bans, whitelistEnabled: server.whitelistEnabled };
    },
  },

  manage_whitelist: {
    riskLevel: "CONFIRM",
    name: "manage_whitelist",
    description: "화이트리스트를 켜거나 끄고, 플레이어를 추가/제거한다.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["add", "remove", "enable", "disable"] },
        name: { type: "string", description: "add/remove일 때 플레이어 이름" },
      },
      required: ["action"],
    },
    run: async (server, input) => {
      if (!server.pterodactylIdentifier) throw new Error("서버가 아직 준비 중입니다.");
      const identifier = server.pterodactylIdentifier;
      const action = String(input.action);
      if (action === "add") await Players.whitelistAdd(identifier, String(input.name));
      else if (action === "remove") await Players.whitelistRemove(identifier, String(input.name));
      else if (action === "enable") await Players.whitelistToggle(identifier, true);
      else if (action === "disable") await Players.whitelistToggle(identifier, false);
      else throw new Error("알 수 없는 action");
      return { ok: true };
    },
  },

  manage_player: {
    riskLevel: "CONFIRM",
    name: "manage_player",
    description: "플레이어에게 OP를 주거나 뺏고, 킥/밴/밴 해제한다.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["op", "deop", "ban", "pardon", "kick"] },
        name: { type: "string" },
        reason: { type: "string" },
      },
      required: ["action", "name"],
    },
    run: async (server, input) => {
      if (!server.pterodactylIdentifier) throw new Error("서버가 아직 준비 중입니다.");
      const identifier = server.pterodactylIdentifier;
      const name = String(input.name);
      const reason = input.reason ? String(input.reason) : undefined;
      const action = String(input.action);
      if (action === "op") await Players.opPlayer(identifier, name);
      else if (action === "deop") await Players.deopPlayer(identifier, name);
      else if (action === "ban") await Players.banPlayer(identifier, name, reason);
      else if (action === "pardon") await Players.pardonPlayer(identifier, name);
      else if (action === "kick") await Players.kickPlayer(identifier, name, reason);
      else throw new Error("알 수 없는 action");
      return { ok: true };
    },
  },

  search_plugins: {
    riskLevel: "SAFE",
    name: "search_plugins",
    description: "Modrinth에서 이 서버 종류에 맞는 플러그인/모드를 검색한다. 설치하기 전에 먼저 이걸로 찾아본다.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    run: async (server, input) => {
      const template = await prisma.serverTemplate.findUniqueOrThrow({ where: { id: server.templateId } });
      const loader = loaderForTemplateKey(template.key);
      if (!loader) return { results: [], note: "이 서버 종류는 플러그인/모드를 지원하지 않습니다." };
      const results = await searchProjects({ query: String(input.query), loader, limit: 8 });
      return { results };
    },
  },

  install_plugin: {
    riskLevel: "CONFIRM",
    name: "install_plugin",
    description: "search_plugins로 찾은 projectId의 플러그인/모드를, 이 서버 버전에 맞는 최신 버전으로 설치한다.",
    parameters: {
      type: "object",
      properties: { projectId: { type: "string" }, projectTitle: { type: "string" } },
      required: ["projectId"],
    },
    run: async (server, input) => {
      if (!server.pterodactylIdentifier) throw new Error("서버가 아직 준비 중입니다.");
      const template = await prisma.serverTemplate.findUniqueOrThrow({ where: { id: server.templateId } });
      const loader = loaderForTemplateKey(template.key);
      if (!loader) throw new Error("이 서버 종류는 플러그인/모드를 지원하지 않습니다.");

      const gameVersion = server.minecraftVersion && /^\d+\.\d+/.test(server.minecraftVersion) ? server.minecraftVersion : undefined;
      const versions = await getVersions({ projectId: String(input.projectId), loader, gameVersion });
      const best = versions.find((v) => v.primaryFile);
      if (!best?.primaryFile) throw new Error("이 서버 버전에 맞는 파일을 찾지 못했습니다.");

      const bytes = await downloadVersionFile(best.primaryFile);
      const dir = contentTypeForLoader(loader) === "plugin" ? "/plugins" : "/mods";
      await PteroClient.writeBinaryFile(server.pterodactylIdentifier, `${dir}/${best.primaryFile.filename}`, bytes);
      return { ok: true, filename: best.primaryFile.filename, version: best.versionNumber };
    },
  },

  list_files: {
    riskLevel: "SAFE",
    name: "list_files",
    description: "서버의 특정 디렉터리 안 파일/폴더 목록을 조회한다.",
    parameters: {
      type: "object",
      properties: { directory: { type: "string", description: "예: '/', '/plugins'" } },
      required: ["directory"],
    },
    run: async (server, input) => {
      if (!server.pterodactylIdentifier) return { files: [] };
      const files = await PteroClient.listFiles(
        server.pterodactylIdentifier,
        String(input.directory ?? "/"),
      );
      return { files };
    },
  },

  read_file: {
    riskLevel: "SAFE",
    name: "read_file",
    description: "서버의 특정 파일 내용을 읽는다. (예: server.properties, config.yml)",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    run: async (server, input) => {
      if (!server.pterodactylIdentifier) throw new Error("서버가 아직 준비 중입니다.");
      const content = await PteroClient.readFile(
        server.pterodactylIdentifier,
        String(input.path),
      );
      return { content };
    },
  },

  write_file: {
    riskLevel: "CONFIRM",
    name: "write_file",
    description: "서버의 특정 파일 내용을 새로 작성/수정한다.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
    run: async (server, input) => {
      if (!server.pterodactylIdentifier) throw new Error("서버가 아직 준비 중입니다.");
      await PteroClient.writeFile(
        server.pterodactylIdentifier,
        String(input.path),
        String(input.content),
      );
      return { ok: true };
    },
  },

  execute_console_command: {
    riskLevel: "CONFIRM",
    name: "execute_console_command",
    description: "서버 콘솔에 명령어를 실행한다. (예: /gamerule keepInventory true)",
    parameters: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
    },
    run: async (server, input) => {
      if (!server.pterodactylIdentifier) throw new Error("서버가 아직 준비 중입니다.");
      await PteroClient.sendConsoleCommand(server.pterodactylIdentifier, String(input.command));
      return { ok: true };
    },
  },

  restart_server: {
    riskLevel: "CONFIRM",
    name: "restart_server",
    description: "서버를 재시작한다. 설정 변경 후 적용할 때 사용.",
    parameters: { type: "object", properties: {} },
    run: async (server) => {
      if (!server.pterodactylIdentifier) throw new Error("서버가 아직 준비 중입니다.");
      await PteroClient.sendPowerAction(server.pterodactylIdentifier, "restart");
      return { ok: true };
    },
  },

  stop_server: {
    riskLevel: "CONFIRM",
    name: "stop_server",
    description: "서버를 정지한다.",
    parameters: { type: "object", properties: {} },
    run: async (server) => {
      if (!server.pterodactylIdentifier) throw new Error("서버가 아직 준비 중입니다.");
      await PteroClient.sendPowerAction(server.pterodactylIdentifier, "stop");
      return { ok: true };
    },
  },

  start_server: {
    riskLevel: "SAFE",
    name: "start_server",
    description: "서버를 시작한다.",
    parameters: { type: "object", properties: {} },
    run: async (server) => {
      if (!server.pterodactylIdentifier) throw new Error("서버가 아직 준비 중입니다.");
      await PteroClient.sendPowerAction(server.pterodactylIdentifier, "start");
      return { ok: true };
    },
  },

  create_backup: {
    riskLevel: "CONFIRM",
    name: "create_backup",
    description: "서버의 현재 상태를 백업한다. 위험한 작업 전에 자동으로도 호출된다.",
    parameters: {
      type: "object",
      properties: { name: { type: "string" } },
    },
    run: async (server, input) => {
      if (!server.pterodactylIdentifier) throw new Error("서버가 아직 준비 중입니다.");
      const backup = await PteroClient.createBackup(
        server.pterodactylIdentifier,
        String(input.name ?? `AI 자동 백업 ${new Date().toLocaleString("ko-KR")}`),
      );
      return backup;
    },
  },

  delete_files: {
    riskLevel: "DANGEROUS",
    name: "delete_files",
    description: "서버의 파일/폴더를 삭제한다. 되돌릴 수 없으니 신중하게 사용.",
    parameters: {
      type: "object",
      properties: {
        directory: { type: "string" },
        files: { type: "array", items: { type: "string" } },
      },
      required: ["directory", "files"],
    },
    run: async (server, input) => {
      if (!server.pterodactylIdentifier) throw new Error("서버가 아직 준비 중입니다.");
      await PteroClient.deleteFiles(
        server.pterodactylIdentifier,
        String(input.directory),
        input.files as string[],
      );
      return { ok: true };
    },
  },

  restore_backup: {
    riskLevel: "DANGEROUS",
    name: "restore_backup",
    description: "지정한 백업으로 서버를 복원한다. 현재 데이터를 덮어쓴다.",
    parameters: {
      type: "object",
      properties: { backupUuid: { type: "string" } },
      required: ["backupUuid"],
    },
    run: async (server, input) => {
      if (!server.pterodactylIdentifier) throw new Error("서버가 아직 준비 중입니다.");
      await PteroClient.sendPowerAction(server.pterodactylIdentifier, "stop");
      await PteroClient.restoreBackup(server.pterodactylIdentifier, String(input.backupUuid));
      return { ok: true };
    },
  },
};

export function openAiToolList(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return Object.values(AI_TOOLS).map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}
