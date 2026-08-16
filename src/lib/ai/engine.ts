import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { AI_TOOLS, anthropicToolList } from "@/lib/ai/tools";
import type { Server } from "@/generated/prisma/client";
import type { AiMessage } from "@/generated/prisma/client";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
const MAX_STEPS = 6;

const SYSTEM_PROMPT = `너는 Burnae 호스팅의 서버 관리 도우미야. 사용자의 마인크래프트 서버를 직접 조작할 수 있는 도구를 갖고 있어.
말투는 친절하고 자연스러운 한국어 존댓말을 쓰고, 불필요하게 기술적이거나 딱딱한 표현은 피해. "AI로서", "저는 언어 모델입니다" 같은 표현은 절대 쓰지 마.
사용자가 서버 설정, 플러그인, 명령어, 오류 등에 대해 물으면 먼저 필요한 정보를 도구로 직접 확인한 뒤 답해. 추측하지 말고 실제로 확인해.
파일 수정, 명령어 실행, 재시작, 백업, 삭제처럼 서버에 실제로 영향을 주는 도구는 사용자 승인이 필요하니, 왜 그 작업이 필요한지 짧게 설명한 뒤 도구를 호출해.
답변은 간결하게, 꼭 필요한 내용만 전달해.`;

type ContentBlockLike = Record<string, unknown>;

function toAnthropicMessages(rows: AiMessage[]): Anthropic.MessageParam[] {
  return rows.map((row) => {
    if (row.role === "USER") {
      return { role: "user", content: row.content };
    }
    if (row.role === "ASSISTANT") {
      const content = (row.toolCalls as ContentBlockLike[] | null) ?? row.content;
      return { role: "assistant", content };
    }
    // TOOL: 이전 tool_use에 대한 결과를 user 메시지로 되돌려준다 (Anthropic 규격)
    return {
      role: "user",
      content: (row.toolCalls as ContentBlockLike[]) ?? [],
    };
  }) as unknown as Anthropic.MessageParam[];
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

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      tools: anthropicToolList(),
      messages: toAnthropicMessages(rows),
    });

    const textBlocks = response.content.filter((b) => b.type === "text");
    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
    const assistantText = textBlocks.map((b) => (b as { text: string }).text).join("\n").trim();

    const savedAssistant = await prisma.aiMessage.create({
      data: {
        conversationId,
        role: "ASSISTANT",
        content: assistantText || "(도구 호출)",
        toolCalls: toolUseBlocks.length > 0 ? (response.content as unknown as object) : undefined,
      },
    });
    void savedAssistant;

    if (response.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
      return { status: "DONE", assistantText: assistantText || null };
    }

    // 모델이 여러 도구를 동시에 요청할 수 있지만, 하나라도 승인이 필요하면 그 지점에서 멈춘다.
    for (const block of toolUseBlocks) {
      const use = block as Anthropic.ToolUseBlock;
      const tool = AI_TOOLS[use.name];
      if (!tool) continue;

      if (tool.riskLevel !== "SAFE") {
        const activity = await prisma.aiActivityLog.create({
          data: {
            userId,
            serverId: server.id,
            conversationId,
            toolUseId: use.id,
            toolName: use.name,
            riskLevel: tool.riskLevel,
            status: "PENDING_APPROVAL",
            input: use.input as object,
          },
        });
        return { status: "PENDING_APPROVAL", assistantText: assistantText || null, pendingActivityLogId: activity.id };
      }
    }

    // 이 스텝의 도구가 전부 SAFE 였다면 실행하고 결과를 대화에 이어붙인 뒤 다시 모델을 호출한다.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const use = block as Anthropic.ToolUseBlock;
      const tool = AI_TOOLS[use.name];
      let resultContent: string;
      try {
        const result = await tool.run(server, (use.input as Record<string, unknown>) ?? {});
        resultContent = JSON.stringify(result);
        await prisma.aiActivityLog.create({
          data: {
            userId,
            serverId: server.id,
            conversationId,
            toolUseId: use.id,
            toolName: use.name,
            riskLevel: tool.riskLevel,
            status: "EXECUTED",
            input: (use.input as object) ?? {},
            result: result as object,
            resolvedAt: new Date(),
          },
        });
      } catch (err) {
        resultContent = `오류: ${err instanceof Error ? err.message : "알 수 없는 오류"}`;
      }
      toolResults.push({ type: "tool_result", tool_use_id: use.id, content: resultContent });
    }

    await prisma.aiMessage.create({
      data: {
        conversationId,
        role: "TOOL",
        content: `🔧 ${toolUseBlocks.map((b) => (b as Anthropic.ToolUseBlock).name).join(", ")} 실행 완료`,
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
          {
            type: "tool_result",
            tool_use_id: activity.toolUseId,
            content: "사용자가 이 작업을 취소했습니다.",
          },
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
        { type: "tool_result", tool_use_id: activity.toolUseId, content: resultContent, is_error: !ok },
      ] as unknown as object,
    },
  });

  return runAiTurn(activity.conversationId, activity.server, activity.userId);
}
