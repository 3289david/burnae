import type Anthropic from "@anthropic-ai/sdk";
import { PteroClient } from "@/lib/pterodactyl";
import type { Server } from "@/generated/prisma/client";
import type { AiRiskLevel } from "@/generated/prisma/enums";

/**
 * Burnae AI가 사용할 수 있는 유일한 창구.
 * AI는 Docker/Pterodactyl을 직접 호출하지 않고 반드시 이 제한된 Tool만 통과한다.
 * 위험도(riskLevel)에 따라 SAFE는 즉시 실행, 그 외는 사용자 승인 후에만 실행된다.
 */

export interface ToolDef {
  riskLevel: AiRiskLevel;
  anthropic: Anthropic.Tool;
  run: (server: Server, input: Record<string, unknown>) => Promise<unknown>;
}

export const AI_TOOLS: Record<string, ToolDef> = {
  get_server_status: {
    riskLevel: "SAFE",
    anthropic: {
      name: "get_server_status",
      description: "서버의 현재 상태(온라인 여부, CPU/RAM/디스크 사용량, 가동시간)를 조회한다.",
      input_schema: { type: "object", properties: {} },
    },
    run: async (server) => {
      if (!server.pterodactylIdentifier) return { status: "PROVISIONING" };
      return PteroClient.getServerResources(server.pterodactylIdentifier);
    },
  },

  read_recent_console: {
    riskLevel: "SAFE",
    anthropic: {
      name: "read_recent_console",
      description: "서버 콘솔의 최근 출력 로그를 읽어 오류나 상태를 분석한다.",
      input_schema: { type: "object", properties: {} },
    },
    run: async (server) => {
      if (!server.pterodactylIdentifier) return { lines: [] };
      const lines = await PteroClient.captureRecentConsoleOutput(server.pterodactylIdentifier);
      return { lines };
    },
  },

  list_files: {
    riskLevel: "SAFE",
    anthropic: {
      name: "list_files",
      description: "서버의 특정 디렉터리 안 파일/폴더 목록을 조회한다.",
      input_schema: {
        type: "object",
        properties: { directory: { type: "string", description: "예: '/', '/plugins'" } },
        required: ["directory"],
      },
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
    anthropic: {
      name: "read_file",
      description: "서버의 특정 파일 내용을 읽는다. (예: server.properties, config.yml)",
      input_schema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
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
    anthropic: {
      name: "write_file",
      description: "서버의 특정 파일 내용을 새로 작성/수정한다.",
      input_schema: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
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
    anthropic: {
      name: "execute_console_command",
      description: "서버 콘솔에 명령어를 실행한다. (예: /gamerule keepInventory true)",
      input_schema: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
    },
    run: async (server, input) => {
      if (!server.pterodactylIdentifier) throw new Error("서버가 아직 준비 중입니다.");
      await PteroClient.sendConsoleCommand(server.pterodactylIdentifier, String(input.command));
      return { ok: true };
    },
  },

  restart_server: {
    riskLevel: "CONFIRM",
    anthropic: {
      name: "restart_server",
      description: "서버를 재시작한다. 설정 변경 후 적용할 때 사용.",
      input_schema: { type: "object", properties: {} },
    },
    run: async (server) => {
      if (!server.pterodactylIdentifier) throw new Error("서버가 아직 준비 중입니다.");
      await PteroClient.sendPowerAction(server.pterodactylIdentifier, "restart");
      return { ok: true };
    },
  },

  stop_server: {
    riskLevel: "CONFIRM",
    anthropic: {
      name: "stop_server",
      description: "서버를 정지한다.",
      input_schema: { type: "object", properties: {} },
    },
    run: async (server) => {
      if (!server.pterodactylIdentifier) throw new Error("서버가 아직 준비 중입니다.");
      await PteroClient.sendPowerAction(server.pterodactylIdentifier, "stop");
      return { ok: true };
    },
  },

  start_server: {
    riskLevel: "SAFE",
    anthropic: {
      name: "start_server",
      description: "서버를 시작한다.",
      input_schema: { type: "object", properties: {} },
    },
    run: async (server) => {
      if (!server.pterodactylIdentifier) throw new Error("서버가 아직 준비 중입니다.");
      await PteroClient.sendPowerAction(server.pterodactylIdentifier, "start");
      return { ok: true };
    },
  },

  create_backup: {
    riskLevel: "CONFIRM",
    anthropic: {
      name: "create_backup",
      description: "서버의 현재 상태를 백업한다. 위험한 작업 전에 자동으로도 호출된다.",
      input_schema: {
        type: "object",
        properties: { name: { type: "string" } },
      },
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
    anthropic: {
      name: "delete_files",
      description: "서버의 파일/폴더를 삭제한다. 되돌릴 수 없으니 신중하게 사용.",
      input_schema: {
        type: "object",
        properties: {
          directory: { type: "string" },
          files: { type: "array", items: { type: "string" } },
        },
        required: ["directory", "files"],
      },
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
    anthropic: {
      name: "restore_backup",
      description: "지정한 백업으로 서버를 복원한다. 현재 데이터를 덮어쓴다.",
      input_schema: {
        type: "object",
        properties: { backupUuid: { type: "string" } },
        required: ["backupUuid"],
      },
    },
    run: async (server, input) => {
      if (!server.pterodactylIdentifier) throw new Error("서버가 아직 준비 중입니다.");
      await PteroClient.sendPowerAction(server.pterodactylIdentifier, "stop");
      await PteroClient.restoreBackup(server.pterodactylIdentifier, String(input.backupUuid));
      return { ok: true };
    },
  },
};

export function anthropicToolList(): Anthropic.Tool[] {
  return Object.values(AI_TOOLS).map((t) => t.anthropic);
}

