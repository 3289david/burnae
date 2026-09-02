"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Server, Plus, CreditCard, User, Users, Gift, ShieldCheck, CornerDownLeft } from "lucide-react";

interface ServerOption {
  id: string;
  name: string;
  status: string;
}

interface StaticAction {
  id: string;
  label: string;
  hint?: string;
  href: string;
  icon: typeof Search;
}

export const OPEN_COMMAND_PALETTE_EVENT = "open-command-palette";

function buildStaticActions(showAdminLink: boolean): StaticAction[] {
  const actions: StaticAction[] = [
    { id: "new-server", label: "새 서버 만들기", href: "/dashboard/servers/new", icon: Plus },
    { id: "dashboard", label: "대시보드", href: "/dashboard", icon: Server },
    { id: "community-eggs", label: "커뮤니티 프리셋", href: "/dashboard/community-eggs", icon: Users },
    { id: "promotions", label: "홍보 포인트", href: "/dashboard/promotions", icon: Gift },
    { id: "billing", label: "결제 내역", href: "/dashboard/billing", icon: CreditCard },
    { id: "account", label: "계정 설정", href: "/dashboard/account", icon: User },
  ];
  if (showAdminLink) actions.push({ id: "admin", label: "관리자 페이지", href: "/admin", icon: ShieldCheck });
  return actions;
}

/** 대시보드 전역에서 Cmd/Ctrl+K로 여는 빠른 이동 팔레트 — 서버 검색 + 주요 액션 바로가기 */
export default function CommandPalette({ showAdminLink }: { showAdminLink: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [servers, setServers] = useState<ServerOption[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const staticActions = buildStaticActions(showAdminLink);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      return;
    }
    inputRef.current?.focus();
    if (servers === null) {
      fetch("/api/servers")
        .then((r) => (r.ok ? r.json() : []))
        .then((data: { id: string; name: string; status: string }[]) =>
          setServers(data.map((s) => ({ id: s.id, name: s.name, status: s.status }))),
        )
        .catch(() => setServers([]));
    }
  }, [open, servers]);

  const q = query.trim().toLowerCase();
  const matchedServers = (servers ?? []).filter((s) => !q || s.name.toLowerCase().includes(q));
  const matchedActions = staticActions.filter((a) => !q || a.label.toLowerCase().includes(q));

  const results: { key: string; label: string; hint?: string; icon: typeof Search; go: () => void }[] = [
    ...matchedServers.map((s) => ({
      key: `server-${s.id}`,
      label: s.name,
      hint: s.status === "RUNNING" ? "온라인" : undefined,
      icon: Server,
      go: () => router.push(`/dashboard/servers/${s.id}`),
    })),
    ...matchedActions.map((a) => ({
      key: a.id,
      label: a.label,
      icon: a.icon,
      go: () => router.push(a.href),
    })),
  ];

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function select(i: number) {
    const r = results[i];
    if (!r) return;
    r.go();
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/40 flex items-start justify-center pt-24 px-4 animate-fs-backdrop"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden animate-modal-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search size={16} className="text-text-dim shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                select(activeIndex);
              }
            }}
            placeholder="서버 검색 또는 이동할 페이지..."
            className="flex-1 bg-transparent outline-none text-sm"
          />
          <kbd className="text-[10px] text-text-dim bg-surface-2 rounded px-1.5 py-0.5 shrink-0">ESC</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-1.5">
          {results.length === 0 && (
            <p className="text-sm text-text-dim text-center py-6">결과가 없어요.</p>
          )}
          {results.map((r, i) => {
            const Icon = r.icon;
            return (
              <button
                key={r.key}
                onClick={() => select(i)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors ${
                  i === activeIndex ? "bg-accent/10 text-accent" : "text-text hover:bg-surface-2"
                }`}
              >
                <Icon size={15} className="shrink-0" />
                <span className="flex-1 truncate">{r.label}</span>
                {r.hint && <span className="text-[11px] text-text-dim shrink-0">{r.hint}</span>}
                {i === activeIndex && <CornerDownLeft size={13} className="text-text-dim shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
