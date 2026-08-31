"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import StatusDot from "@/components/StatusDot";
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
  ramMb: number;
  diskMb: number;
  category: Category;
  address: string;
}

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
  const [filter, setFilter] = useState<"ALL" | Category>("ALL");

  const availableCategories = useMemo(() => {
    const set = new Set<Category>();
    for (const s of servers) set.add(s.category);
    return Array.from(set);
  }, [servers]);

  const filtered = useMemo(
    () => (filter === "ALL" ? servers : servers.filter((s) => s.category === filter)),
    [servers, filter]
  );

  return (
    <div>
      {availableCategories.length > 1 && (
        <div className="mt-6 flex flex-wrap gap-2 animate-fade-up">
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
        </div>
      )}

      <div className="mt-4 grid sm:grid-cols-2 gap-4">
        {filtered.map((s, i) => {
          const label = STATUS_LABEL[s.status] ?? { text: s.status, dot: "gray" as const };
          return (
            <Link
              key={s.id}
              href={`/dashboard/servers/${s.id}`}
              className="card-glow p-5 block animate-fade-up active:scale-[0.98] transition-transform"
              style={{ animationDelay: `${0.1 + i * 0.05}s` }}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-2">
                <span className="flex items-center gap-1.5 min-w-0">
                  {s.isOwner && <FavoriteButton serverId={s.id} initial={s.isFavorite} />}
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
                  RAM {(s.ramMb / 1024).toFixed(0)}GB
                </span>
                <span className="rounded-full bg-surface-2 px-2.5 py-1 text-text-dim">
                  디스크 {(s.diskMb / 1024).toFixed(0)}GB
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-text-dim mt-6 animate-fade-up">이 종류의 서버가 없어요.</p>
      )}
    </div>
  );
}
