"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  LayoutGrid, Terminal, Users, Puzzle, Folder, RefreshCw, UserPlus, Settings, Bot, Wand2, Pencil, Check, X,
} from "lucide-react";
import OverviewTab from "./OverviewTab";
import ConsoleTab from "./ConsoleTab";
import PlayersTab from "./PlayersTab";
import PluginsTab from "./PluginsTab";
import FilesTab from "./FilesTab";
import BackupsTab from "./BackupsTab";
import TeamTab from "./TeamTab";
import SettingsTab from "./SettingsTab";
import AiTab from "./AiTab";

export interface ServerSubdomainInfo {
  id: string;
  subdomain: string;
  isPrimary: boolean;
}

export interface ServerCustomDomainInfo {
  id: string;
  hostname: string;
  verified: boolean;
}

export interface ServerInfo {
  id: string;
  name: string;
  status: string;
  productId: string | null;
  renewalDueAt: string | null;
  autoBackupEnabled: boolean;
  autoBackupIntervalHours: number;
  autoRestartEnabled: boolean;
  autoRestartHour: number | null;
  subdomains: ServerSubdomainInfo[];
  subdomainZone: string;
  customDomains: ServerCustomDomainInfo[];
  allocationIp: string | null;
  allocationPort: number | null;
  extraPorts: { id: number; ip: string; port: number }[];
  ownerNote: string | null;
  ramMb: number;
  diskMb: number;
  cpuPercent: number;
  backupSlots: number;
  templateName: string;
  templateCategory: "MINECRAFT" | "VPS" | "DISCORD_BOT" | "GENERAL";
  minecraftVersion: string | null;
  isOwner: boolean;
  isFreeServer: boolean;
  accessSecret: string | null;
}

const TABS = [
  { key: "overview", label: "개요", icon: LayoutGrid },
  { key: "console", label: "콘솔", icon: Terminal },
  { key: "players", label: "플레이어", icon: Users },
  { key: "plugins", label: "플러그인", icon: Puzzle },
  { key: "maker", label: "메이커", icon: Wand2 },
  { key: "files", label: "파일", icon: Folder },
  { key: "backups", label: "백업", icon: RefreshCw },
  { key: "team", label: "팀", icon: UserPlus },
  { key: "settings", label: "설정", icon: Settings },
  { key: "ai", label: "AI", icon: Bot },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// 플레이어/플러그인 탭은 마인크래프트 전용 기능(화이트리스트, Modrinth 검색)이라 VPS/디스코드봇 같은
// 일반 서버에는 의미가 없어 숨긴다. 메이커는 이제 서버 종류에 상관없이(플러그인/봇/웹사이트 등) 대화로
// 뭔가를 만드는 채팅이라 모든 종류에서 보여준다.
const MINECRAFT_ONLY_TABS = new Set(["players", "plugins"]);

export default function ServerDetailClient({ server }: { server: ServerInfo }) {
  const [tab, setTab] = useState<TabKey>("overview");
  const [name, setName] = useState(server.name);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(server.name);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const addresses = server.subdomains.map((s) => `${s.subdomain}.${server.subdomainZone}`);
  const visibleTabs = TABS.filter((t) => server.templateCategory === "MINECRAFT" || !MINECRAFT_ONLY_TABS.has(t.key));

  // 토스식 슬라이딩 탭 인디케이터 — 활성 탭 뒤 배경이 색 전환 없이 실제로 미끄러져 이동한다
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = tabRefs.current[tab];
    if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [tab, visibleTabs.length]);
  const primarySubdomain = server.subdomains.find((s) => s.isPrimary) ?? server.subdomains[0];
  const previewAddress =
    server.templateCategory !== "MINECRAFT" && primarySubdomain && server.allocationPort
      ? `${primarySubdomain.subdomain}.${server.subdomainZone}:${server.allocationPort}`
      : null;

  async function saveName() {
    setNameSaving(true);
    setNameError(null);
    try {
      const res = await fetch(`/api/servers/${server.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setName(data.name);
      setEditingName(false);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "이름 변경 실패");
    } finally {
      setNameSaving(false);
    }
  }

  return (
    <div className="relative">
      <div className="blob w-64 h-64 bg-purple -top-24 -right-16 animate-float pointer-events-none" />

      <div className="relative flex items-center justify-between flex-wrap gap-2 animate-fade-up">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-accent/15 flex items-center justify-center shrink-0">
            <LayoutGrid size={20} className="text-accent" />
          </span>
          <div>
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  className="input py-1 text-lg font-bold font-display"
                  value={nameInput}
                  maxLength={24}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveName()}
                />
                <button onClick={saveName} disabled={nameSaving} className="text-green p-1" aria-label="저장">
                  <Check size={18} />
                </button>
                <button
                  onClick={() => {
                    setEditingName(false);
                    setNameInput(name);
                    setNameError(null);
                  }}
                  className="text-text-dim p-1"
                  aria-label="취소"
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              <h1 className="text-2xl font-bold font-display flex items-center gap-2">
                {name}
                {server.isOwner && (
                  <button
                    onClick={() => setEditingName(true)}
                    className="text-text-dim hover:text-accent"
                    aria-label="이름 바꾸기"
                  >
                    <Pencil size={15} />
                  </button>
                )}
              </h1>
            )}
            {nameError && <p className="text-xs text-red mt-0.5">{nameError}</p>}
            {addresses.length > 0 && (
              <p className="text-text-dim text-sm mt-0.5 font-mono">{addresses.join(" · ")}</p>
            )}
          </div>
        </div>
      </div>

      <div
        className="relative mt-6 flex gap-1 overflow-x-auto p-1 bg-surface-2 rounded-full w-fit max-w-full animate-fade-up"
        style={{ animationDelay: "0.05s" }}
      >
        {indicator && (
          <span
            className="absolute top-1 bottom-1 rounded-full bg-accent shadow-sm transition-[left,width] duration-300 ease-[cubic-bezier(0.65,0,0.35,1)]"
            style={{ left: indicator.left, width: indicator.width }}
          />
        )}
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            ref={(el) => {
              tabRefs.current[t.key] = el;
            }}
            onClick={() => setTab(t.key)}
            className={`relative z-10 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors duration-150 shrink-0 ${
              tab === t.key ? "text-white" : "text-text-dim hover:text-text"
            }`}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="relative mt-6 animate-fade-up" style={{ animationDelay: "0.1s" }}>
        {tab === "overview" && <OverviewTab server={server} />}
        {tab === "console" && <ConsoleTab serverId={server.id} templateCategory={server.templateCategory} />}
        {tab === "players" && <PlayersTab serverId={server.id} />}
        {tab === "plugins" && <PluginsTab serverId={server.id} />}
        {tab === "maker" && (
          <AiTab serverId={server.id} templateCategory={server.templateCategory} kind="MAKER" previewAddress={previewAddress} />
        )}
        {tab === "files" && <FilesTab serverId={server.id} />}
        {tab === "backups" && <BackupsTab serverId={server.id} backupSlots={server.backupSlots} />}
        {tab === "team" && <TeamTab serverId={server.id} isOwner={server.isOwner} />}
        {tab === "settings" && (
          <SettingsTab
            serverId={server.id}
            isOwner={server.isOwner}
            productId={server.productId}
            templateCategory={server.templateCategory}
            autoBackupEnabled={server.autoBackupEnabled}
            autoBackupIntervalHours={server.autoBackupIntervalHours}
            autoRestartEnabled={server.autoRestartEnabled}
            autoRestartHour={server.autoRestartHour}
            ownerNote={server.ownerNote}
          />
        )}
        {tab === "ai" && <AiTab serverId={server.id} templateCategory={server.templateCategory} />}
      </div>
    </div>
  );
}
