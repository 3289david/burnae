"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Wrench, ExternalLink, Folder, MessageCircle, Wand2 } from "lucide-react";
import AiCreditsCard from "./AiCreditsCard";
import MakerFilePanel from "./MakerFilePanel";
import { hasServerRank, type ServerAccessRole } from "@/lib/serverRoleRank";
import { Lock } from "lucide-react";

interface Message {
  id: string;
  role: "USER" | "ASSISTANT" | "TOOL";
  content: string;
  createdAt: string;
}
interface PendingActivity {
  id: string;
  toolName: string;
  riskLevel: "SAFE" | "CONFIRM" | "DANGEROUS";
  input: Record<string, unknown>;
}
interface AiTask {
  id: string;
  title: string;
  status: "PENDING" | "DONE";
  order: number;
}

const TOOL_LABEL_KEY: Record<string, string> = {
  write_file: "toolWriteFile",
  execute_console_command: "toolExecConsole",
  restart_server: "toolRestart",
  stop_server: "toolStop",
  create_backup: "toolBackup",
  delete_files: "toolDeleteFiles",
  restore_backup: "toolRestoreBackup",
  generate_minecraft_plugin: "toolGenPlugin",
};

type Category = "MINECRAFT" | "DISCORD_BOT" | "GENERAL";

const CHAT_EXAMPLE_KEY: Record<Category, string> = {
  MINECRAFT: "chatExampleMinecraft",
  DISCORD_BOT: "chatExampleDiscord",
  GENERAL: "chatExampleGeneral",
};

const MAKER_EXAMPLE_KEY: Record<Category, string> = {
  MINECRAFT: "makerExampleMinecraft",
  DISCORD_BOT: "makerExampleDiscord",
  GENERAL: "makerExampleGeneral",
};

/** 탭을 백그라운드로 보내거나 네트워크가 바뀌면 fetch가 응답도 에러도 없이 그냥 멈춰버릴 수
 * 있다 — 그러면 busy가 영원히 true로 남아서 "적용하기" 버튼이 다시 들어오기 전까진 안 눌렸다.
 * 일정 시간 뒤엔 강제로 포기해서 버튼이 다시 눌리게 한다. (서버 쪽 작업 자체는
 * proxy_ignore_client_abort 덕에 끊기지 않고 계속 돈다 — 이건 이 fetch 요청만 끝내는 것)
 */
const FETCH_TIMEOUT_MS = 180_000;
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export default function AiTab({
  serverId,
  templateCategory = "MINECRAFT",
  previewAddress = null,
  myRole,
}: {
  serverId: string;
  templateCategory?: Category;
  previewAddress?: string | null;
  myRole: ServerAccessRole | null;
}) {
  const t = useTranslations("aiTab");
  const canUseAi = hasServerRank(myRole, "DEVELOPER");
  // 예전엔 "AI"/"메이커"가 서로 다른 탭이었다 — OpenCode/Claude Code처럼 탭을 늘리는 대신 한
  // 화면 안에서 모드만 바꾸는 쪽으로 통합했다. 대화 자체는 모드별로 완전히 분리돼서(서버
  // kind="CHAT"|"MAKER") 모드를 바꾸면 그 모드의 별도 대화 목록을 불러온다.
  const [kind, setKind] = useState<"CHAT" | "MAKER">("CHAT");
  const [model, setModel] = useState<"opus" | "sonnet" | "haiku">("sonnet");
  const [showFiles, setShowFiles] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<{ id: string; title: string; updatedAt: string }[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<PendingActivity | null>(null);
  const [tasks, setTasks] = useState<AiTask[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadConversationList() {
    const res = await fetch(`/api/ai/conversations?serverId=${serverId}&kind=${kind}`);
    if (res.ok) setConversations(await res.json());
  }

  async function startNewConversation() {
    setLoadError(null);
    try {
      const res = await fetch("/api/ai/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serverId, kind, model }) });
      const data = await res.json();
      if (!res.ok || !data.id) throw new Error(data.error ?? t("startConvFailed"));
      setConversationId(data.id);
      setMessages([]);
      setPending(null);
      setTasks([]);
      await loadConversationList();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t("startConvFailed"));
    }
  }

  useEffect(() => {
    if (!canUseAi) return;
    setMessages([]);
    setPending(null);
    setTasks([]);
    setChatError(null);
    (async () => {
      const res = await fetch(`/api/ai/conversations?serverId=${serverId}&kind=${kind}`);
      if (!res.ok) {
        setLoadError(t("convListLoadFailed"));
        return;
      }
      const list = await res.json();
      setConversations(list);
      if (list.length > 0) {
        setConversationId(list[0].id);
      } else {
        await startNewConversation();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, kind]);

  async function refresh(id: string) {
    const res = await fetch(`/api/ai/conversations/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setMessages(data.messages);
    setPending(data.pendingActivity);
    setTasks(data.tasks ?? []);
    if (data.model === "opus" || data.model === "sonnet" || data.model === "haiku") {
      setModel(data.model);
    }
  }

  async function changeModel(next: "opus" | "sonnet" | "haiku") {
    setModel(next);
    if (!conversationId) return;
    await fetch(`/api/ai/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: next }),
    }).catch(() => {});
  }

  useEffect(() => {
    if (conversationId) refresh(conversationId);
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending, busy]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!conversationId || !input.trim() || busy) return;
    const text = input;
    setInput("");
    setBusy(true);
    setChatError(null);
    setMessages((prev) => [...prev, { id: `tmp-${Date.now()}`, role: "USER", content: text, createdAt: new Date().toISOString() }]);
    // 메이커는 파일을 여러 개 만드느라 응답까지 오래 걸릴 수 있어서, 기다리는 동안에도 주기적으로
    // 대화를 다시 불러와 지금까지 만든 파일들(진행 로그)이 실시간으로 보이게 한다
    const pollTimer = setInterval(() => refresh(conversationId), 2500);
    try {
      const res = await fetchWithTimeout(`/api/ai/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setChatError(data.error ?? t("sendFailed"));
      }
      await refresh(conversationId);
    } catch {
      // 연결이 끊긴 채 멈춰버린 경우(탭 백그라운드, 네트워크 전환 등) — 서버 쪽 작업은
      // nginx proxy_ignore_client_abort 덕에 끝까지 돌지만, 이 fetch 자체는 응답을 못 받을 수
      // 있다. 타임아웃으로 끝내고 다시 불러와서 결과를 반영한다 — 버튼이 영원히 안 눌리는 걸 막음
      setChatError(t("sendFailed"));
      await refresh(conversationId).catch(() => {});
    } finally {
      clearInterval(pollTimer);
      setBusy(false);
    }
  }

  async function resolve(decision: "APPROVE" | "REJECT") {
    if (!pending || !conversationId) return;
    setBusy(true);
    try {
      await fetchWithTimeout(`/api/ai/activity/${pending.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      await refresh(conversationId);
    } catch {
      setChatError(t("sendFailed"));
      await refresh(conversationId).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  if (!canUseAi) {
    return (
      <div className="card p-8 flex flex-col items-center justify-center gap-2 text-center">
        <Lock size={22} className="text-text-dim" />
        <p className="font-medium">{t("noPermTitle")}</p>
        <p className="text-sm text-text-dim">{t("noPermDesc")}</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <AiCreditsCard />
        <div className="card-glow p-5 space-y-3 animate-fade-up">
          <p className="text-sm text-red">{loadError}</p>
          <button onClick={startNewConversation} className="btn-secondary px-4 py-2 text-sm">{t("retry")}</button>
        </div>
      </div>
    );
  }

  return (
    <div>
    <AiCreditsCard />
    <div className="card-glow p-0 overflow-hidden flex flex-col h-[32rem] animate-fade-up">
      <div className="px-4 pt-3 pb-2 border-b border-border flex items-center flex-wrap gap-2">
        <div className="inline-flex rounded-lg bg-surface-2 p-0.5 text-xs shrink-0">
          <button
            onClick={() => setKind("CHAT")}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
              kind === "CHAT" ? "bg-bg text-text shadow-sm" : "text-text-dim"
            }`}
          >
            <MessageCircle size={12} /> {t("modeChat")}
          </button>
          <button
            onClick={() => setKind("MAKER")}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
              kind === "MAKER" ? "bg-bg text-text shadow-sm" : "text-text-dim"
            }`}
          >
            <Wand2 size={12} /> {t("modeMaker")}
          </button>
        </div>
        {kind === "MAKER" ? (
          <select
            value={model}
            onChange={(e) => changeModel(e.target.value as "opus" | "sonnet" | "haiku")}
            className="input text-xs py-1 px-2 shrink-0 w-auto"
            title={t("modelPickerHint")}
          >
            <option value="opus">{t("modelOpus")}</option>
            <option value="sonnet">{t("modelSonnet")}</option>
            <option value="haiku">{t("modelHaiku")}</option>
          </select>
        ) : (
          <span className="text-xs text-text-dim px-2.5 py-1 rounded-md bg-surface-2 border border-border shrink-0">
            claude-sonnet-4-6-free
          </span>
        )}
        {conversations.length > 1 ? (
          <select
            value={conversationId ?? ""}
            onChange={(e) => setConversationId(e.target.value)}
            className="input py-1 text-xs w-full sm:flex-1 sm:w-auto min-w-0 order-last sm:order-none"
          >
            {conversations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({new Date(c.updatedAt).toLocaleDateString()})
              </option>
            ))}
          </select>
        ) : (
          <div className="flex-1" />
        )}
        {kind === "MAKER" && (
          <button
            onClick={() => setShowFiles((v) => !v)}
            className={`text-xs shrink-0 inline-flex items-center gap-1 ${showFiles ? "text-accent" : "text-text-dim"}`}
          >
            <Folder size={13} /> {t("files")}
          </button>
        )}
        <button onClick={startNewConversation} className="text-xs text-accent shrink-0">
          {t("newConversation")}
        </button>
      </div>
      {kind === "MAKER" && previewAddress && (
        <div className="px-4 py-1.5 border-b border-border flex items-center justify-between gap-2 bg-surface-2/50">
          <span className="text-xs font-mono text-text-dim truncate">{previewAddress}</span>
          <a
            href={`http://${previewAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent inline-flex items-center gap-1 shrink-0"
          >
            <ExternalLink size={12} /> {t("preview")}
          </a>
        </div>
      )}
      {kind === "MAKER" && showFiles && <MakerFilePanel serverId={serverId} refreshKey={messages.length} />}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-text-dim">
            {t((kind === "MAKER" ? MAKER_EXAMPLE_KEY : CHAT_EXAMPLE_KEY)[templateCategory])}
          </p>
        )}
        {messages.map((m) =>
          m.role === "TOOL" ? (
            <div key={m.id} className="animate-toast-in flex items-center gap-1.5 text-xs text-text-dim pl-1">
              <Wrench size={12} className="shrink-0" />
              {m.content}
            </div>
          ) : (
            <div key={m.id} className={`animate-fade-up flex ${m.role === "USER" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  m.role === "USER" ? "bg-accent text-white" : "bg-surface-2"
                }`}
              >
                {m.content}
              </div>
            </div>
          ),
        )}

        {chatError && <p className="text-sm text-red text-center">{chatError}</p>}

        {busy && !pending && (
          <div className="flex justify-start">
            <div className="bg-surface-2 rounded-2xl px-4 py-3 inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-text-dim animate-typing-dot" style={{ animationDelay: "0s" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-text-dim animate-typing-dot" style={{ animationDelay: "0.15s" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-text-dim animate-typing-dot" style={{ animationDelay: "0.3s" }} />
            </div>
          </div>
        )}

        {pending && (
          <div className="animate-success-ring card-glow p-4 border-yellow">
            <p className="text-sm">
              {t("pendingActionMsg", { tool: TOOL_LABEL_KEY[pending.toolName] ? t(TOOL_LABEL_KEY[pending.toolName]) : pending.toolName })}
              {pending.riskLevel === "DANGEROUS" && t("autoBackupNote")}
            </p>
            {typeof pending.input?.command === "string" && (
              <p className="mt-1 text-xs font-mono text-text-dim">/{String(pending.input.command)}</p>
            )}
            {typeof pending.input?.path === "string" && (
              <p className="mt-1 text-xs font-mono text-text-dim">{String(pending.input.path)}</p>
            )}
            {typeof pending.input?.description === "string" && (
              <p className="mt-1 text-xs text-text-dim">{String(pending.input.description)}</p>
            )}
            <div className="mt-3 flex gap-2">
              <button onClick={() => resolve("APPROVE")} disabled={busy} className="btn-primary px-4 py-1.5 text-sm">{t("apply")}</button>
              <button onClick={() => resolve("REJECT")} disabled={busy} className="btn-secondary px-4 py-1.5 text-sm">{t("cancel")}</button>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="border-t border-border flex">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy || !!pending}
          placeholder={pending ? t("waitingApproval") : busy ? (kind === "MAKER" ? t("makerWorking") : t("processingPlaceholder")) : t("messagePlaceholder")}
          className="flex-1 bg-transparent px-4 py-3 text-sm outline-none"
        />
        <button type="submit" disabled={busy || !!pending} className="px-4 text-accent font-medium">
          {busy ? "..." : t("send")}
        </button>
      </form>
    </div>
    </div>
  );
}
