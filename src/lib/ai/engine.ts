import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { AI_TOOLS, openAiToolList } from "@/lib/ai/tools";
import type { Server } from "@/generated/prisma/client";
import type { AiMessage } from "@/generated/prisma/client";

/**
 * OpenRouter(OpenAI 호환 API)를 통해 저렴한 오픈소스 모델을 사용한다.
 * 기본값 Qwen3 235B A22B Instruct — Apache-2.0 오픈소스, tool-calling 지원, 저렴함.
 * https://openrouter.ai/qwen/qwen3-235b-a22b-2507
 *
 * 클라이언트는 첫 호출 시점에 생성한다 — OpenAI SDK는 apiKey가 없으면 생성자에서
 * 바로 예외를 던지는데, 빌드 시점(next build의 route 정적 분석)에는 아직 .env가
 * 없을 수 있으므로 모듈 로드 시점에 즉시 생성하면 빌드가 깨진다.
 */
let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY || "unset",
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://burnae.kr",
        "X-Title": "Burnae AI",
      },
    });
  }
  return _client;
}
const MODEL = process.env.OPENROUTER_MODEL ?? "qwen/qwen3-235b-a22b-2507";
const MAX_STEPS = 6;

const SYSTEM_PROMPT = `너는 Burnae 호스팅의 서버 관리 도우미야. 사용자의 마인크래프트 서버를 직접 조작할 수 있는 도구를 갖고 있어.
말투는 친절하고 자연스러운 한국어 존댓말을 쓰고, 불필요하게 기술적이거나 딱딱한 표현은 피해. "AI로서", "저는 언어 모델입니다" 같은 표현은 절대 쓰지 마.
사용자가 서버 설정, 플러그인, 명령어, 오류 등에 대해 물으면 먼저 필요한 정보를 도구로 직접 확인한 뒤 답해. 추측하지 말고 실제로 확인해.
파일 수정, 명령어 실행, 재시작, 백업, 삭제처럼 서버에 실제로 영향을 주는 도구는 사용자 승인이 필요하니, 왜 그 작업이 필요한지 짧게 설명한 뒤 도구를 호출해.
답변은 간결하게, 꼭 필요한 내용만 전달해.`;

interface StoredToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
interface StoredToolResult {
  tool_call_id: string;
  content: string;
}

function toOpenAiMessages(rows: AiMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  for (const row of rows) {
    if (row.role === "USER") {
      messages.push({ role: "user", content: row.content });
    } else if (row.role === "ASSISTANT") {
      const toolCalls = row.toolCalls as StoredToolCall[] | null;
      messages.push({
        role: "assistant",
        content: row.content || null,
        ...(toolCalls ? { tool_calls: toolCalls } : {}),
      });
    } else {
      // TOOL: 이전 tool_calls 각각에 대한 결과를 순서대로 되돌려준다
      const results = (row.toolCalls as StoredToolResult[] | null) ?? [];
      for (const result of results) {
        messages.push({ role: "tool", tool_call_id: result.tool_call_id, content: result.content });
      }
    }
  }

  return messages;
}

export interface AiTurnResult {
  status: "DONE" | "PENDING_APPROVAL";
  assistantText: string | null;
  pendingActivityLogId?: string;
}

/**
 * 한 번의 모델 호출 사이클을 실행한다. SAFE 도구는 즉시 실행하며 다음 스텝으로 진행하고,
 * CONFIRM/DANGEROUS 도구를 모델이 요청하면 실행하지 않고 승인 대기 상태로 멈춘다.
 */
export async function runAiTurn(
  conversationId: string,
  server: Server,
  userId: string,
): Promise<AiTurnResult> {
  for (let step = 0; step < MAX_STEPS; step++) {
    const rows = await prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });

    const response = await getClient().chat.completions.create({
      model: MODEL,
      messages: toOpenAiMessages(rows),
      tools: openAiToolList(),
      tool_choice: "auto",
      parallel_tool_calls: false,
    });

    const message = response.choices[0]?.message;
    if (!message) {
      return { status: "DONE", assistantText: "응답을 받지 못했어요. 잠시 후 다시 시도해주세요." };
    }

    // parallel_tool_calls:false 는 힌트일 뿐 모든 모델/프로바이더가 지키진 않으므로,
    // 저장/실행 단계에서도 항상 한 스텝당 도구 호출 1개만 다루도록 강제한다.
    // (여러 개를 섞어서 저장하면 SAFE 도구는 즉시 실행되고 승인 필요 도구만 대기하게 되어,
    //  나중에 승인해도 SAFE 쪽 tool_call_id에 대한 응답이 영영 없는 상태가 되어 대화가 깨짐 — OpenAI 프로토콜 위반)
    const toolCalls = (message.tool_calls ?? []).slice(0, 1);
    const assistantText = message.content?.trim() || "";

    await prisma.aiMessage.create({
      data: {
        conversationId,
        role: "ASSISTANT",
        content: assistantText || "(도구 호출)",
        toolCalls: toolCalls.length > 0 ? (toolCalls as unknown as object) : undefined,
      },
    });

    if (toolCalls.length === 0) {
      return { status: "DONE", assistantText: assistantText || null };
    }

    // toolCalls는 항상 0~1개 (위에서 강제로 잘라둠). 승인이 필요한 도구면 실행하지 않고 멈춘다.
    for (const call of toolCalls) {
      if (call.type !== "function") continue;
      const tool = AI_TOOLS[call.function.name];
      if (!tool) continue;

      if (tool.riskLevel !== "SAFE") {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(call.function.arguments || "{}");
        } catch {
          // 파싱 실패 시 빈 입력으로 승인 요청 (사용자가 취소할 수 있음)
        }
        const activity = await prisma.aiActivityLog.create({
          data: {
            userId,
            serverId: server.id,
            conversationId,
            toolUseId: call.id,
            toolName: call.function.name,
            riskLevel: tool.riskLevel,
            status: "PENDING_APPROVAL",
            input: input as object,
          },
        });
        return { status: "PENDING_APPROVAL", assistantText: assistantText || null, pendingActivityLogId: activity.id };
      }
    }

    // 이 스텝의 도구가 전부 SAFE 였다면 실행하고 결과를 대화에 이어붙인 뒤 다시 모델을 호출한다.
    const toolResults: StoredToolResult[] = [];
    for (const call of toolCalls) {
      if (call.type !== "function") continue;
      const tool = AI_TOOLS[call.function.name];
      let resultContent: string;
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(call.function.arguments || "{}");
      } catch {
        // 무시하고 빈 입력으로 진행
      }
      try {
        const result = await tool.run(server, input);
        resultContent = JSON.stringify(result);
        await prisma.aiActivityLog.create({
          data: {
            userId,
            serverId: server.id,
            conversationId,
            toolUseId: call.id,
            toolName: call.function.name,
            riskLevel: tool.riskLevel,
            status: "EXECUTED",
            input: input as object,
            result: result as object,
            resolvedAt: new Date(),
          },
        });
      } catch (err) {
        resultContent = `오류: ${err instanceof Error ? err.message : "알 수 없는 오류"}`;
      }
      toolResults.push({ tool_call_id: call.id, content: resultContent });
    }

    await prisma.aiMessage.create({
      data: {
        conversationId,
        role: "TOOL",
        content: `🔧 ${toolCalls.map((c) => (c.type === "function" ? c.function.name : c.type)).join(", ")} 실행 완료`,
        toolCalls: toolResults as unknown as object,
      },
    });
    // 루프 계속 — 다음 스텝에서 모델이 결과를 보고 이어서 응답
  }

  return {
    status: "DONE",
    assistantText: "요청이 복잡해서 여기까지만 처리했어요. 이어서 다시 말씀해주시면 계속 진행할게요.",
  };
}

/** 승인/거절 처리 후 대화를 이어간다 */
export async function resolveAiActivity(
  activityId: string,
  decision: "APPROVE" | "REJECT",
): Promise<AiTurnResult> {
  const activity = await prisma.aiActivityLog.findUniqueOrThrow({
    where: { id: activityId },
    include: { server: true },
  });
  if (activity.status !== "PENDING_APPROVAL") {
    throw new Error("이미 처리된 작업입니다.");
  }
  if (!activity.conversationId || !activity.toolUseId) {
    throw new Error("대화 컨텍스트를 찾을 수 없습니다.");
  }

  const tool = AI_TOOLS[activity.toolName];

  if (decision === "REJECT") {
    await prisma.aiActivityLog.update({
      where: { id: activityId },
      data: { status: "REJECTED", resolvedAt: new Date() },
    });
    await prisma.aiMessage.create({
      data: {
        conversationId: activity.conversationId,
        role: "TOOL",
        content: `🚫 ${activity.toolName} 작업이 취소되었습니다.`,
        toolCalls: [
          { tool_call_id: activity.toolUseId, content: "사용자가 이 작업을 취소했습니다." },
        ] as unknown as object,
      },
    });
    return runAiTurn(activity.conversationId, activity.server, activity.userId);
  }

  // DANGEROUS 작업은 실행 전 자동 백업
  let backupId: string | undefined;
  if (activity.riskLevel === "DANGEROUS" && activity.server.pterodactylIdentifier) {
    try {
      const { PteroClient } = await import("@/lib/pterodactyl");
      const backup = await PteroClient.createBackup(
        activity.server.pterodactylIdentifier,
        `AI 작업 전 자동 백업 ${new Date().toLocaleString("ko-KR")}`,
      );
      backupId = backup.uuid;
    } catch (err) {
      console.error("[ai] 위험 작업 전 자동 백업 실패:", err);
    }
  }

  let resultContent: string;
  let ok = true;
  try {
    const result = await tool.run(
      activity.server,
      activity.input as Record<string, unknown>,
    );
    resultContent = JSON.stringify(result);
    await prisma.aiActivityLog.update({
      where: { id: activityId },
      data: { status: "EXECUTED", result: result as object, resolvedAt: new Date(), backupId },
    });
  } catch (err) {
    ok = false;
    resultContent = `오류: ${err instanceof Error ? err.message : "알 수 없는 오류"}`;
    await prisma.aiActivityLog.update({
      where: { id: activityId },
      data: { status: "FAILED", resolvedAt: new Date(), backupId },
    });
  }

  await prisma.aiMessage.create({
    data: {
      conversationId: activity.conversationId,
      role: "TOOL",
      content: ok ? `✅ ${activity.toolName} 실행 완료` : `❌ ${activity.toolName} 실행 실패`,
      toolCalls: [
        { tool_call_id: activity.toolUseId, content: resultContent },
      ] as unknown as object,
    },
  });

  return runAiTurn(activity.conversationId, activity.server, activity.userId);
}
