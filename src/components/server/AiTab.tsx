"use client";

import { useEffect, useRef, useState } from "react";
import AiCreditsCard from "./AiCreditsCard";

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
};

const EXAMPLE_PROMPTS: Record<"MINECRAFT" | "VPS" | "DISCORD_BOT" | "GENERAL", string> = {
  MINECRAFT: '서버에 원하는 걸 말해보세요. 예) "커맨드 블럭 켜줘", "최대 인원 30명으로 바꿔줘"',
  DISCORD_BOT: '서버에 원하는 걸 말해보세요. 예) "봇 재시작해줘", "requirements.txt에 패키지 추가해줘"',
  VPS: '서버에 원하는 걸 말해보세요. 예) "포트 열려있는지 확인해줘", "로그 파일 보여줘"',
  GENERAL: '서버에 원하는 걸 말해보세요. 예) "설정 파일 고쳐줘", "서버 재시작해줘"',
};

export default function AiTab({
  serverId,
  templateCategory = "MINECRAFT",
}: {
  serverId: string;
  templateCategory?: "MINECRAFT" | "VPS" | "DISCORD_BOT" | "GENERAL";
}) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<{ id: string; title: string; updatedAt: string }[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<PendingActivity | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadConversationList() {
    const res = await fetch(`/api/ai/conversations?serverId=${serverId}`);
    if (res.ok) setConversations(await res.json());
  }

  async function startNewConversation() {
    const res = await fetch("/api/ai/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serverId }) });
    const data = await res.json();
    setConversationId(data.id);
    setMessages([]);
    setPending(null);
    await loadConversationList();
  }

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/ai/conversations?serverId=${serverId}`);
      const list = res.ok ? await res.json() : [];
      setConversations(list);
      if (list.length > 0) {
        setConversationId(list[0].id);
      } else {
        await startNewConversation();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

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
  }, [messages, pending]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!conversationId || !input.trim() || busy) return;
    const text = input;
    setInput("");
    setBusy(true);
    setChatError(null);
    setMessages((prev) => [...prev, { id: `tmp-${Date.now()}`, role: "USER", content: text, createdAt: new Date().toISOString() }]);
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
        <button onClick={startNewConversation} className="text-xs text-accent shrink-0 ml-auto">
          + 새 대화
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-text-dim">{EXAMPLE_PROMPTS[templateCategory]}</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "USER" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                m.role === "USER" ? "bg-accent text-white" : "bg-surface-2"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {chatError && <p className="text-sm text-red text-center">{chatError}</p>}

        {pending && (
          <div className="card-glow p-4 border-yellow">
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
          placeholder={pending ? "승인 대기 중이에요..." : "메시지를 입력하세요..."}
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
