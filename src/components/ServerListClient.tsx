"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, X, CheckSquare, Check, Play, Square as StopIcon, RotateCw } from "lucide-react";
import StatusDot from "@/components/StatusDot";
import { formatMb } from "@/lib/formatSize";
import FavoriteButton from "@/components/FavoriteButton";

type Category = "MINECRAFT" | "DISCORD_BOT" | "GENERAL";

const CATEGORY_FILTER_LABEL: Record<"ALL" | Category, string> = {
  ALL: "전체",
  MINECRAFT: "마인크래프트",
  DISCORD_BOT: "디스코드 봇",
  GENERAL: "일반 서버",
};

const CATEGORY_BADGE_LABEL: Record<Category, string> = {
  MINECRAFT: "마인크래프트",
  DISCORD_BOT: "디스코드 봇",
  GENERAL: "일반 서버",
};

export interface DashboardServerItem {
  id: string;
  name: string;
  ownerId: string;
  isOwner: boolean;
  isFavorite: boolean;
  status: string;
  /** Pterodactyl 쪽에 실제 컨테이너가 아직 만들어졌는지 — "생성 중"이면 아직 없다 */
  hasIdentifier: boolean;
  ramMb: number;
  diskMb: number;
  category: Category;
  address: string;
}

const TRANSIENT_STATUSES = new Set(["PROVISIONING", "STARTING", "STOPPING", "DELETING"]);

/** Wings가 돌려주는 실시간 상태를 우리 DB의 status 값으로 맞춰서 쓴다 */
const WINGS_STATE_TO_STATUS: Record<string, string> = {
  running: "RUNNING",
  starting: "STARTING",
  stopping: "STOPPING",
  offline: "STOPPED",
};

const STATUS_LABEL: Record<string, { text: string; dot: "green" | "yellow" | "red" | "gray" }> = {
  RUNNING: { text: "온라인", dot: "green" },
  PROVISIONING: { text: "생성 중", dot: "yellow" },
  STARTING: { text: "시작 중", dot: "yellow" },
  STOPPING: { text: "정지 중", dot: "yellow" },
  STOPPED: { text: "오프라인", dot: "red" },
  SUSPENDED: { text: "정지됨(결제 필요)", dot: "red" },
  ERROR: { text: "오류", dot: "red" },
  DELETING: { text: "삭제 중", dot: "red" },
};

export default function ServerListClient({ servers }: { servers: DashboardServerItem[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"ALL" | Category>("ALL");
  const [query, setQuery] = useState("");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [liveStatus, setLiveStatus] = useState<Record<string, string>>({});
  const liveStatusRef = useRef(liveStatus);
  liveStatusRef.current = liveStatus;

  // "생성 중"/"시작 중" 같은 과도기 상태는 새로고침해야만 바뀐 걸 볼 수 있었다 — 컨테이너가
  // 이미 있는 서버는 Wings 실시간 상태를 직접 물어보고, 아직 컨테이너 자체가 없는(=아직
  // 우리 DB의 provisioning 코드가 안 끝난) 서버는 페이지 데이터를 통째로 다시 불러온다.
  useEffect(() => {
    const withIdentifier = servers.filter(
      (s) => s.hasIdentifier && TRANSIENT_STATUSES.has(liveStatusRef.current[s.id] ?? s.status),
    );
    const withoutIdentifier = servers.filter((s) => !s.hasIdentifier && TRANSIENT_STATUSES.has(s.status));
    if (withIdentifier.length === 0 && withoutIdentifier.length === 0) return;

    const interval = setInterval(async () => {
      if (withoutIdentifier.length > 0) router.refresh();
      for (const s of withIdentifier) {
        try {
          const res = await fetch(`/api/servers/${s.id}/resources`);
          if (!res.ok) continue;
          const data = await res.json();
          const mapped = WINGS_STATE_TO_STATUS[data.current_state];
          if (mapped && liveStatusRef.current[s.id] !== mapped) {
            setLiveStatus((prev) => ({ ...prev, [s.id]: mapped }));
          }
        } catch {
          // 일시적 네트워크 오류 — 다음 틱에서 다시 시도
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [servers, router]);

  const ownedCount = useMemo(() => servers.filter((s) => s.isOwner).length, [servers]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulkPower(signal: "start" | "stop" | "restart") {
    if (selected.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      await Promise.allSettled(
        Array.from(selected).map((id) =>
          fetch(`/api/servers/${id}/power`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ signal }),
          }),
        ),
      );
      setSelected(new Set());
      setSelectMode(false);
      router.refresh();
    } finally {
      setBulkBusy(false);
    }
  }

  const availableCategories = useMemo(() => {
    const set = new Set<Category>();
    for (const s of servers) set.add(s.category);
    return Array.from(set);
  }, [servers]);

  const filtered = useMemo(() => {
    let list = filter === "ALL" ? servers : servers.filter((s) => s.category === filter);
    if (onlineOnly) list = list.filter((s) => (liveStatus[s.id] ?? s.status) === "RUNNING");
    if (query.trim()) list = list.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()));
    return list;
  }, [servers, filter, onlineOnly, query, liveStatus]);

  return (
    <div>
      {servers.length > 4 && (
        <div className="mt-6 relative animate-fade-up">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="서버 이름으로 검색"
            className="input w-full pl-9 pr-9"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text active:scale-90 transition-transform"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {(availableCategories.length > 1 || servers.some((s) => s.status === "RUNNING") || ownedCount > 1) && (
        <div className="mt-3 flex flex-wrap gap-2 animate-fade-up">
          {ownedCount > 1 && (
            <button
              onClick={() => {
                setSelectMode((v) => !v);
                setSelected(new Set());
              }}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all active:scale-95 inline-flex items-center gap-1.5 ${
                selectMode ? "bg-accent text-white shadow-sm" : "bg-surface-2 text-text-dim hover:text-text"
              }`}
            >
              <CheckSquare size={13} /> {selectMode ? "선택 취소" : "여러 개 선택"}
            </button>
          )}
          {(["ALL", ...availableCategories] as const).map((c, i) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all active:scale-95 animate-fade-up ${
                filter === c
                  ? "bg-accent text-white shadow-sm"
                  : "bg-surface-2 text-text-dim hover:text-text"
              }`}
              style={{ animationDelay: `${i * 0.03}s` }}
            >
              {CATEGORY_FILTER_LABEL[c]}
            </button>
          ))}
          <button
            onClick={() => setOnlineOnly((v) => !v)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all active:scale-95 animate-fade-up inline-flex items-center gap-1.5 ${
              onlineOnly ? "bg-green/15 text-green" : "bg-surface-2 text-text-dim hover:text-text"
            }`}
            style={{ animationDelay: `${(availableCategories.length + 1) * 0.03}s` }}
          >
            <span className="relative inline-flex w-1.5 h-1.5">
              {onlineOnly && <span className="absolute inset-0 rounded-full bg-green animate-ping" />}
              <span className={`relative w-1.5 h-1.5 rounded-full ${onlineOnly ? "bg-green" : "bg-text-dim"}`} />
            </span>
            실행 중만
          </button>
        </div>
      )}

      <div className={`mt-4 grid sm:grid-cols-2 gap-4 ${selected.size > 0 ? "pb-20" : ""}`}>
        {filtered.map((s, i) => {
          const effectiveStatus = liveStatus[s.id] ?? s.status;
          const label = STATUS_LABEL[effectiveStatus] ?? { text: effectiveStatus, dot: "gray" as const };
          const checkable = selectMode && s.isOwner;
          const isChecked = selected.has(s.id);
          const cardContent = (
            <>
              <div className="flex flex-wrap items-center justify-between gap-x-2">
                <span className="flex items-center gap-1.5 min-w-0">
                  {checkable && (
                    <span
                      className={`w-4 h-4 rounded-md border shrink-0 flex items-center justify-center transition-colors ${
                        isChecked ? "bg-accent border-accent" : "border-border"
                      }`}
                    >
                      {isChecked && <Check size={11} className="text-white" strokeWidth={3} />}
                    </span>
                  )}
                  {!selectMode && s.isOwner && <FavoriteButton serverId={s.id} initial={s.isFavorite} />}
                  <span className="font-semibold truncate min-w-0">{s.name}</span>
                </span>
                <span className="text-sm shrink-0 inline-flex items-center gap-1.5">
                  <StatusDot color={label.dot} /> {label.text}
                </span>
              </div>
              <p className="mt-1 text-sm text-text-dim font-mono truncate">{s.address}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-surface-2 px-2.5 py-1 text-text-dim">
                  {CATEGORY_BADGE_LABEL[s.category]}
                </span>
                <span className="rounded-full bg-surface-2 px-2.5 py-1 text-text-dim">
                  RAM {formatMb(s.ramMb)}
                </span>
                <span className="rounded-full bg-surface-2 px-2.5 py-1 text-text-dim">
                  디스크 {formatMb(s.diskMb)}
                </span>
              </div>
            </>
          );

          if (checkable) {
            return (
              <button
                key={s.id}
                onClick={() => toggleSelected(s.id)}
                className={`card-glow p-5 text-left animate-fade-up hover-lift active:scale-[0.98] transition-transform ${
                  isChecked ? "border-accent shadow-[0_0_0_1px_var(--accent)]" : ""
                }`}
                style={{ animationDelay: `${0.1 + i * 0.05}s` }}
              >
                {cardContent}
              </button>
            );
          }

          return (
            <Link
              key={s.id}
              href={selectMode ? "#" : `/dashboard/servers/${s.id}`}
              onClick={(e) => selectMode && e.preventDefault()}
              className={`card-glow p-5 block animate-fade-up hover-lift active:scale-[0.98] transition-transform ${
                selectMode ? "opacity-50" : ""
              }`}
              style={{ animationDelay: `${0.1 + i * 0.05}s` }}
            >
              {cardContent}
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-text-dim mt-6 animate-fade-up">
          {query ? "검색 결과가 없어요." : "이 조건에 맞는 서버가 없어요."}
        </p>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 card-glow px-4 py-3 flex items-center gap-3 animate-slide-in-bottom shadow-lg">
          <span className="text-sm font-medium">{selected.size}개 선택됨</span>
          <button
            onClick={() => runBulkPower("start")}
            disabled={bulkBusy}
            className="btn-secondary px-3 py-1.5 text-xs inline-flex items-center gap-1 active:scale-95 transition-transform disabled:opacity-50"
          >
            <Play size={12} /> 시작
          </button>
          <button
            onClick={() => runBulkPower("restart")}
            disabled={bulkBusy}
            className="btn-secondary px-3 py-1.5 text-xs inline-flex items-center gap-1 active:scale-95 transition-transform disabled:opacity-50"
          >
            <RotateCw size={12} /> 재시작
          </button>
          <button
            onClick={() => runBulkPower("stop")}
            disabled={bulkBusy}
            className="btn-secondary px-3 py-1.5 text-xs inline-flex items-center gap-1 active:scale-95 transition-transform disabled:opacity-50"
          >
            <StopIcon size={12} /> 중지
          </button>
        </div>
      )}
    </div>
  );
}
