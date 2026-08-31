"use client";

import { useEffect, useRef, useState } from "react";
import { Wrench, ExternalLink, Folder } from "lucide-react";
import AiCreditsCard from "./AiCreditsCard";
import MakerFilePanel from "./MakerFilePanel";

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

const TOOL_LABEL: Record<string, string> = {
  write_file: "파일 수정",
  execute_console_command: "콘솔 명령 실행",
  restart_server: "서버 재시작",
  stop_server: "서버 정지",
  create_backup: "백업 생성",
  delete_files: "파일 삭제",
  restore_backup: "백업 복원",
  generate_minecraft_plugin: "플러그인/모드 생성",
};

type Category = "MINECRAFT" | "DISCORD_BOT" | "GENERAL";

const CHAT_EXAMPLE_PROMPTS: Record<Category, string> = {
  MINECRAFT: '서버에 원하는 걸 말해보세요. 예) "커맨드 블럭 켜줘", "최대 인원 30명으로 바꿔줘"',
  DISCORD_BOT: '서버에 원하는 걸 말해보세요. 예) "봇 재시작해줘", "requirements.txt에 패키지 추가해줘"',
  GENERAL: '서버에 원하는 걸 말해보세요. 예) "포트 열려있는지 확인해줘", "로그 파일 보여줘", "설정 파일 고쳐줘"',
};

const MAKER_EXAMPLE_PROMPTS: Record<Category, string> = {
  MINECRAFT: '어떤 플러그인/모드를 만들고 싶으세요? 예) "커맨드 블럭 켜면 폭죽 터지는 플러그인 만들어줘". 나중에 "쿨다운도 추가해줘"처럼 이어서 업그레이드도 가능해요.',
  DISCORD_BOT: '어떤 봇을 만들고 싶으세요? 예) "/안녕 하면 인사하는 봇 만들어줘". 이미 만든 봇이 있다면 "슬래시 명령어 하나 더 추가해줘"처럼 이어서 업그레이드도 가능해요.',
  GENERAL: '무엇을 만들고 싶으세요? 예) "심플한 방명록 웹사이트 만들어줘", "간단한 API 서버 만들어줘". 이어서 "디자인 좀 더 예쁘게 해줘"처럼 업그레이드도 가능해요.',
};

export default function AiTab({
  serverId,
  templateCategory = "MINECRAFT",
  kind = "CHAT",
  previewAddress = null,
}: {
  serverId: string;
  templateCategory?: Category;
  kind?: "CHAT" | "MAKER";
  previewAddress?: string | null;
}) {
  const [showFiles, setShowFiles] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<{ id: string; title: string; updatedAt: string }[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<PendingActivity | null>(null);
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
      const res = await fetch("/api/ai/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serverId, kind }) });
      const data = await res.json();
      if (!res.ok || !data.id) throw new Error(data.error ?? "대화를 시작하지 못했어요.");
      setConversationId(data.id);
      setMessages([]);
      setPending(null);
      await loadConversationList();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "대화를 시작하지 못했어요.");
    }
  }

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/ai/conversations?serverId=${serverId}&kind=${kind}`);
      if (!res.ok) {
        setLoadError("대화 목록을 불러오지 못했어요. 새로고침해보세요.");
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
      const res = await fetch(`/api/ai/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setChatError(data.error ?? "메시지 전송에 실패했어요.");
      }
      await refresh(conversationId);
    } finally {
      clearInterval(pollTimer);
      setBusy(false);
    }
  }

  async function resolve(decision: "APPROVE" | "REJECT") {
    if (!pending || !conversationId) return;
    setBusy(true);
    try {
      await fetch(`/api/ai/activity/${pending.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      await refresh(conversationId);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div>
        <AiCreditsCard />
        <div className="card-glow p-5 space-y-3 animate-fade-up">
          <p className="text-sm text-red">{loadError}</p>
          <button onClick={startNewConversation} className="btn-secondary px-4 py-2 text-sm">다시 시도</button>
        </div>
      </div>
    );
  }

  return (
    <div>
    <AiCreditsCard />
    <div className="card-glow p-0 overflow-hidden flex flex-col h-[32rem] animate-fade-up">
      <div className="px-4 py-2 border-b border-border flex items-center gap-2">
        {conversations.length > 1 && (
          <select
            value={conversationId ?? ""}
            onChange={(e) => setConversationId(e.target.value)}
            className="input py-1 text-xs flex-1 min-w-0"
          >
            {conversations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({new Date(c.updatedAt).toLocaleDateString("ko-KR")})
              </option>
            ))}
          </select>
        )}
        {kind === "MAKER" && (
          <button
            onClick={() => setShowFiles((v) => !v)}
            className={`text-xs shrink-0 inline-flex items-center gap-1 ${showFiles ? "text-accent" : "text-text-dim"} ${conversations.length > 1 ? "" : "ml-auto"}`}
          >
            <Folder size={13} /> 파일
          </button>
        )}
        <button onClick={startNewConversation} className={`text-xs text-accent shrink-0 ${kind === "MAKER" ? "" : "ml-auto"}`}>
          + 새 대화
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
            <ExternalLink size={12} /> 미리보기
          </a>
        </div>
      )}
      {kind === "MAKER" && showFiles && <MakerFilePanel serverId={serverId} refreshKey={messages.length} />}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-text-dim">
            {(kind === "MAKER" ? MAKER_EXAMPLE_PROMPTS : CHAT_EXAMPLE_PROMPTS)[templateCategory]}
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
              <strong>{TOOL_LABEL[pending.toolName] ?? pending.toolName}</strong> 작업을 실행하려고 해요.
              {pending.riskLevel === "DANGEROUS" && " 실행 전에 자동으로 백업할게요."}
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
              <button onClick={() => resolve("APPROVE")} disabled={busy} className="btn-primary px-4 py-1.5 text-sm">적용하기</button>
              <button onClick={() => resolve("REJECT")} disabled={busy} className="btn-secondary px-4 py-1.5 text-sm">취소</button>
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
          placeholder={pending ? "승인 대기 중이에요..." : busy ? (kind === "MAKER" ? "만드는 중이에요... 위에서 진행 상황을 볼 수 있어요" : "처리 중이에요...") : "메시지를 입력하세요..."}
          className="flex-1 bg-transparent px-4 py-3 text-sm outline-none"
        />
        <button type="submit" disabled={busy || !!pending} className="px-4 text-accent font-medium">
          {busy ? "..." : "전송"}
        </button>
      </form>
    </div>
    </div>
  );
}
