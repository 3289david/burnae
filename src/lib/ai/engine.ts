import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { AI_TOOLS, openAiToolList } from "@/lib/ai/tools";
import { withUsageTracking, AiTurnFailedError, type UsageAccumulator } from "@/lib/ai/usageTracking";
import { creditsForUsage, InsufficientCreditsError } from "@/lib/ai/pricing";
import { createChatCompletion, createApmixChatCompletion } from "@/lib/ai/provider";
import { resolveAiModelKey } from "@/lib/ai/models";
import type { Server } from "@/generated/prisma/client";
import type { AiMessage } from "@/generated/prisma/client";
import type { ServerCategory } from "@/generated/prisma/enums";

export { InsufficientCreditsError };

const MAX_STEPS_CHAT = 6;
// 메이커는 웹사이트/봇 하나 만드는 데 파일 여러 개 + 재시작까지 한 번에 필요해서 스텝을 넉넉히 준다
const MAX_STEPS_MAKER = 20;
// plan_tasks로 등록한 작업이 아직 남아있으면 MAX_STEPS_MAKER를 넘어서도 끊지 않고 계속
// 진행한다 — 그래도 버그 있는 응답이 무한히 도는 걸 막기 위한 절대 상한선
const MAX_STEPS_MAKER_WITH_PENDING_TASKS = 100;

/**
 * CONFIRM 등급인 도구 중, "메이커"(뭔가를 만들고 업그레이드하는) 대화에서는 파일 하나하나 승인받게
 * 하면 Base44/Lovable 같은 매끄러운 빌드 경험이 불가능하다 — 그래서 메이커 대화에서는 이 도구들을
 * SAFE처럼 승인 없이 바로 실행한다. delete_files/restore_backup처럼 되돌리기 어려운 도구는 대화
 * 종류와 상관없이 항상 승인을 받는다.
 */
const MAKER_AUTO_EXECUTE_TOOLS = new Set([
  "write_file",
  "execute_console_command",
  "restart_server",
  "generate_minecraft_plugin",
]);

const COMMON_PROMPT = `말투는 친절하고 자연스러운 한국어 존댓말을 쓰고, 불필요하게 기술적이거나 딱딱한 표현은 피해. "AI로서", "저는 언어 모델입니다" 같은 표현은 절대 쓰지 마.
사용자가 서버 설정, 명령어, 오류 등에 대해 물으면 먼저 필요한 정보를 도구로 직접 확인한 뒤 답해. 추측하지 말고 실제로 확인해.
답변은 간결하게, 꼭 필요한 내용만 전달해.`;

const CHAT_APPROVAL_NOTE = `파일 수정, 명령어 실행, 재시작, 백업, 삭제처럼 서버에 실제로 영향을 주는 도구는 사용자 승인이 필요하니,
왜 그 작업이 필요한지 짧게 설명한 뒤 도구를 호출해.`;

/**
 * "뭔가를 만들거나 고쳐줘" 같은 요청(디스코드 봇 기능 추가, 웹사이트 페이지 만들기 등)을 받으면
 * 결과물을 처음부터 다시 쓰기 전에 read_file/list_files로 지금 있는 코드를 먼저 확인하고, 그 위에
 * 자연스럽게 이어지도록 수정해야 한다 — 안 그러면 매번 새로 만들면서 이전에 만든 부분을 지워버린다.
 * 이건 마인크래프트 이외 카테고리(디코봇/VPS/일반 서버)에서 write_file로 코드를 만들 때 공통으로 적용된다.
 */
const ITERATIVE_BUILD_GUIDANCE = `사용자가 "이어서", "업그레이드", "기능 추가" 같은 걸 요청하면, 먼저 list_files/read_file로 지금까지
만든 파일을 확인한 뒤, 기존 코드에 자연스럽게 새 기능을 더한 완전한 코드로 다시 써. 처음부터 새로 만들면서
이전에 만든 부분을 지우면 안 돼. 완성된 결과물(실행 가능한 전체 코드)을 만드는 게 목표야 — 짧은 스니펫만
주고 끝내지 마.
웹사이트/봇을 새로 만들거나 여러 기능을 한꺼번에 추가하는 것처럼 단계가 여러 개로 나뉘는 요청이면, 가장
먼저 plan_tasks로 작은 작업들로 나눠서 등록해(예: ["package.json 작성", "index.html 작성", "서버 재시작"]).
그 다음 하나씩 순서대로 처리하면서, 작업을 끝낼 때마다 complete_task로 체크해 나가. 한 턴 안에 다 못 끝내도
시스템이 자동으로 이어서 진행하니 멈추지 말고 끝까지 밀어붙여도 돼 — 중간에 끊길 걱정 없이 작업 목록에 있는
걸 전부 끝내는 게 목표야. 간단한 요청(파일 하나만 고치기 등)이면 plan_tasks 없이 바로 처리해도 돼.
파일 쓰기·명령 실행·재시작은 승인 없이 바로 실행되니 거리낌 없이 이어서 진행해. 웹사이트/API처럼 접속
주소로 확인할 수 있는 걸 만들었다면, 모든 작업이 끝난 뒤 get_server_status로 주소를 가져와서
"여기서 확인해보세요: 주소" 처럼 알려줘.`;

const CHAT_SYSTEM_PROMPT = `너는 Burnae 호스팅의 무료 기본 AI 챗봇이야.
사용자의 서버 상태 확인, 콘솔 로그 조회 및 오류 분석, 플레이어/화이트리스트 관리, 파일 목록 및 파일 내용 조회(읽기), 기본 콘솔 명령 실행, 서버 시작/정지/재시작, 백업 생성 등 일상적인 서버 관리와 기술 질문 답변을 도와주는 역할을 해.

[중요 제약사항 - 메이커 전용 기능 안내]
너는 무료 AI 챗봇이므로 플러그인/모드 제작, 디스코드 봇 개발, 웹사이트/앱 개발, 코드 작성, 파일 직접 수정 및 생성(write_file), 플러그인 설치(install_plugin) 같은 복잡하고 어려운 고난도 개발 작업은 직접 수행할 수 없어.
사용자가 플러그인을 만들어달라거나, 봇/웹사이트를 개발해달라거나, 파일의 코드를 직접 수정/작성해달라는 등 복잡하고 난이도 높은 작업을 요청하면:
- 절대 직접 코드를 파일로 쓰거나 생성할 수 없다고 설명해.
- "해당 작업은 복잡한 개발/빌드 작업이므로 서버 상세 페이지의 '메이커' 탭을 이용해 주세요. 메이커 모드에서는 대화형으로 전체 코드 작성, 플러그인 자동 컴파일 및 서버 적용을 한 번에 진행할 수 있습니다."라고 정중하고 친절하게 안내해.

${COMMON_PROMPT}
${CHAT_APPROVAL_NOTE}`;

function systemPromptFor(category: ServerCategory, kind: "CHAT" | "MAKER"): string {
  if (kind === "CHAT") {
    return CHAT_SYSTEM_PROMPT;
  }

  if (category === "MINECRAFT") {
    return `너는 Burnae 호스팅의 마인크래프트 AI 메이커야. 사용자의 마인크래프트 서버에 들어갈 플러그인, 모드, 데이터팩을 대화형으로 제작하고 업그레이드하는 전문 빌더야.
플러그인/모드/데이터팩을 새로 만들거나 업그레이드해달라는 요청은 generate_minecraft_plugin 도구를 써 — 이 도구는 승인 없이 바로 실행돼. 이 도구는 매번 설명을 바탕으로 처음부터 다시 생성하므로, 이전에 만든 기능이 있다면 이번 설명에 전부 포함시켜서 호출해야 사라지지 않아.
${COMMON_PROMPT}`;
  }
  if (category === "DISCORD_BOT") {
    return `너는 Burnae 호스팅의 디스코드 봇 전문 AI 메이커야. 사용자의 서버에 직접 파일을 쓰고 콘솔 명령을 실행할 수 있는 도구를 갖고 있어서, 대화로 봇 코드를 처음부터 만들거나 기존 봇에 기능을 추가/수정할 수 있어.
${ITERATIVE_BUILD_GUIDANCE}
${COMMON_PROMPT}`;
  }
  return `너는 Burnae 호스팅의 전문 AI 메이커야. 사용자의 서버(VPS, 웹사이트, DB 등 다양한 용도로 쓰일 수 있어)에 직접 파일을 쓰고 콘솔 명령을 실행할 수 있는 도구를 갖고 있어서, 대화로 웹사이트/앱/스크립트 등 원하는 걸 처음부터 만들거나 기존 것에 기능을 추가/수정할 수 있어.
${ITERATIVE_BUILD_GUIDANCE}
${COMMON_PROMPT}`;
}

interface StoredToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
interface StoredToolResult {
  tool_call_id: string;
  content: string;
}

const TOOL_ACTION_LABEL: Record<string, string> = {
  get_server_status: "서버 상태 확인",
  read_recent_console: "콘솔 로그 확인",
  get_players: "플레이어 목록 확인",
  manage_whitelist: "화이트리스트 변경",
  manage_player: "플레이어 관리",
  search_plugins: "플러그인 검색",
  install_plugin: "플러그인 설치",
  list_files: "파일 목록 확인",
  read_file: "파일 읽기",
  write_file: "파일 작성",
  execute_console_command: "콘솔 명령 실행",
  restart_server: "서버 재시작",
  stop_server: "서버 정지",
  start_server: "서버 시작",
  create_backup: "백업 생성",
  delete_files: "파일 삭제",
  restore_backup: "백업 복원",
  generate_minecraft_plugin: "플러그인/모드 생성",
};

/** 진행 로그(빌드 중 파일이 하나씩 만들어지는 걸 보여주기 위함)에 쓸 사람이 읽을 수 있는 한 줄 설명 */
function describeToolCall(call: { function: { name: string; arguments: string } }): string {
  const label = TOOL_ACTION_LABEL[call.function.name] ?? call.function.name;
  let input: Record<string, unknown> = {};
  try {
    input = JSON.parse(call.function.arguments || "{}");
  } catch {
    // 파싱 실패하면 라벨만 보여준다
  }
  if (typeof input.path === "string") return `${label}: ${input.path}`;
  if (typeof input.command === "string") return `${label}: ${input.command}`;
  if (typeof input.directory === "string") return `${label}: ${input.directory}`;
  return label;
}

function toOpenAiMessages(
  rows: AiMessage[],
  category: ServerCategory,
  kind: "CHAT" | "MAKER",
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPromptFor(category, kind) },
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

/** usage에 쌓인 실제 토큰 사용량만큼 사용자 크레딧을 깎는다 (0 아래로는 내려가지 않음).
 * primary(monken.cloud)/fallback(OpenRouter) 중 어느 쪽을 썼는지에 따라 단가가 달라서
 * pricing.ts가 두 버킷을 합쳐서 계산한다. */
async function chargeForUsage(userId: string, usage: UsageAccumulator) {
  const credits = creditsForUsage(usage);
  if (credits <= 0) return;
  await prisma.$executeRaw`UPDATE "User" SET "aiCreditsRemaining" = GREATEST(0, "aiCreditsRemaining" - ${credits}) WHERE id = ${userId}`;
}

/**
 * 한 번의 모델 호출 사이클을 실행한다. SAFE 도구(그리고 메이커 대화의 MAKER_AUTO_EXECUTE_TOOLS)는
 * 즉시 실행하며 다음 스텝으로 진행하고, 그 외 CONFIRM/DANGEROUS 도구를 모델이 요청하면 실행하지
 * 않고 승인 대기 상태로 멈춘다. 크레딧은 1건당 고정이 아니라 이 턴에서 실제로 쓴 토큰량 기준으로
 * 끝난 뒤 한 번에 과금한다 (src/lib/ai/pricing.ts) — 가벼운 메시지는 최소 1크레딧, 스텝이 많거나
 * 긴 생성이 끼면 더 많이 청구된다.
 */
export async function runAiTurn(
  conversationId: string,
  server: Server,
  userId: string,
  options?: { skipBilling?: boolean },
): Promise<AiTurnResult> {
  const [template, conversation] = await Promise.all([
    prisma.serverTemplate.findUniqueOrThrow({
      where: { id: server.templateId },
      select: { category: true },
    }),
    prisma.aiConversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: { kind: true, model: true },
    }),
  ]);
  const kind = conversation.kind;
  const isFreeChat = kind === "CHAT";
  const skipBilling = (options?.skipBilling ?? false) || isFreeChat;

  if (!skipBilling) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { aiCreditsRemaining: true },
    });
    if (user.aiCreditsRemaining <= 0) {
      throw new InsufficientCreditsError();
    }
  }

  const modelKey = resolveAiModelKey(conversation.model);
  const maxSteps = kind === "MAKER" ? MAX_STEPS_MAKER : MAX_STEPS_CHAT;

  // 모델 호출이 도중에 실패해도(OpenRouter 5xx, 도구 에러 등) 그 턴은 전부 "실패했으니 과금
  // 안 함" 처리였다 — 재시도만 반복하면 토큰을 무한히 공짜로 쓸 수 있었다. 실패해도 그때까지
  // 쌓인 사용량만큼은 반드시 과금한 뒤 원래 에러를 그대로 다시 던진다.
  try {
    const { result, usage } = await withUsageTracking(() => runAiTurnLoop());
    if (!skipBilling) await chargeForUsage(userId, usage);
    return result;
  } catch (err) {
    if (err instanceof AiTurnFailedError) {
      if (!skipBilling) {
        await chargeForUsage(userId, err.usage).catch((chargeErr) => {
          console.error("[ai] 실패한 턴 과금 실패:", chargeErr);
        });
      }
      throw err.cause;
    }
    throw err;
  }

  async function runAiTurnLoop(): Promise<AiTurnResult> {
    const hardCap = kind === "MAKER" ? MAX_STEPS_MAKER_WITH_PENDING_TASKS : maxSteps;
    for (let step = 0; step < hardCap; step++) {
      // 기본 스텝 한도(maxSteps)를 넘겼어도, plan_tasks로 등록해둔 작업이 아직 남아있으면
      // 끊지 않고 하드 캡까지 계속 진행한다 — "요청이 복잡해서 여기까지만" 하고 멈추는 대신
      // 작업 목록을 다 끝낼 때까지 자동으로 이어간다.
      if (step >= maxSteps) {
        const pendingCount = await prisma.aiTask.count({ where: { conversationId, status: "PENDING" } });
        if (pendingCount === 0) break;
      }

      const rows = await prisma.aiMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" },
      });

      const response =
        kind === "MAKER"
          ? await createChatCompletion(
              {
                messages: toOpenAiMessages(rows, template.category, kind),
                tools: openAiToolList(template.category, kind),
                tool_choice: "auto",
                parallel_tool_calls: false,
              },
              modelKey,
            )
          : await createApmixChatCompletion({
              messages: toOpenAiMessages(rows, template.category, kind),
              tools: openAiToolList(template.category, kind),
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
      // (SAFE 도구이거나, 메이커 대화에서 MAKER_AUTO_EXECUTE_TOOLS에 속하면 승인 없이 바로 실행)
      for (const call of toolCalls) {
        if (call.type !== "function") continue;
        const tool = AI_TOOLS[call.function.name];
        if (!tool) continue;

        if (kind === "CHAT" && tool.makerOnly) {
          // 무료 기본 AI 챗에서 메이커 전용 고난도 도구를 호출하려 한 경우 차단하고 안내
          await prisma.aiMessage.create({
            data: {
              conversationId,
              role: "TOOL",
              content: "해당 작업은 고난도 개발 작업으로 '메이커' 탭에서만 이용하실 수 있습니다.",
              toolCalls: [
                {
                  tool_call_id: call.id,
                  content: "이 작업은 고난도 개발/빌드 작업으로 '메이커' 탭에서만 사용할 수 있습니다. 사용자를 '메이커' 모드로 안내하세요.",
                },
              ] as unknown as object,
            },
          });
          continue;
        }

        const autoExecuted = tool.riskLevel === "SAFE" || (kind === "MAKER" && MAKER_AUTO_EXECUTE_TOOLS.has(tool.name));
        if (!autoExecuted) {
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

      // 이 스텝의 도구가 전부 자동 실행 대상이었다면 실행하고 결과를 대화에 이어붙인 뒤 다시 모델을 호출한다.
      const toolResults: StoredToolResult[] = [];
      for (const call of toolCalls) {
        if (call.type !== "function") continue;
        const tool = AI_TOOLS[call.function.name];
        if (!tool || (kind === "CHAT" && tool.makerOnly)) continue;
        let resultContent: string;
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(call.function.arguments || "{}");
        } catch {
          // 무시하고 빈 입력으로 진행
        }
        try {
          const result = await tool.run(server, input, conversationId);
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
          content: toolCalls.map((c) => (c.type === "function" ? describeToolCall(c) : c.type)).join(", "),
          toolCalls: toolResults as unknown as object,
        },
      });
      // 루프 계속 — 다음 스텝에서 모델이 결과를 보고 이어서 응답
    }

    return {
      status: "DONE",
      assistantText:
        kind === "MAKER"
          ? "작업이 예상보다 많아서 여기까지만 진행했어요. 남은 작업은 \"계속해줘\"라고 말씀하시면 이어서 진행할게요."
          : "요청이 복잡해서 여기까지만 처리했어요. 이어서 다시 말씀해주시면 계속 진행할게요.",
    };
  }
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

  const conversation = await prisma.aiConversation.findUnique({
    where: { id: activity.conversationId },
    select: { kind: true },
  });
  const isFreeChat = conversation?.kind === "CHAT";
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
    return runAiTurn(activity.conversationId, activity.server, activity.userId, { skipBilling: isFreeChat });
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

  // 승인된 도구 자체가 내부적으로 OpenRouter를 또 호출할 수 있다 (예: generate_minecraft_plugin).
  // 그 사용량도 빠짐없이 과금해야 하므로 실행을 추적 범위로 감싼다.
  let resultContent = "";
  let ok = true;
  const { usage } = await withUsageTracking(async () => {
    try {
      const result = await tool.run(
        activity.server,
        activity.input as Record<string, unknown>,
        activity.conversationId!,
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
  });
  if (!isFreeChat) {
    await chargeForUsage(activity.userId, usage);
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

  return runAiTurn(activity.conversationId, activity.server, activity.userId, { skipBilling: isFreeChat });
}
