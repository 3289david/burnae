"use client";

import { useState } from "react";
import {
  LayoutGrid, Terminal, Users, Puzzle, Folder, RefreshCw, UserPlus, Settings, Bot, Wand2,
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
import PluginMakerTab from "./PluginMakerTab";

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
  productId: string;
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

// 플레이어/플러그인/메이커 탭은 마인크래프트 서버 전용 기능(화이트리스트, Modrinth 검색, AI 플러그인
// 생성)이라 VPS/디스코드봇 같은 일반 서버에는 의미가 없어 숨긴다
const MINECRAFT_ONLY_TABS = new Set(["players", "plugins", "maker"]);

export default function ServerDetailClient({ server }: { server: ServerInfo }) {
  const [tab, setTab] = useState<TabKey>("overview");
  const addresses = server.subdomains.map((s) => `${s.subdomain}.${server.subdomainZone}`);
  const visibleTabs = TABS.filter((t) => server.templateCategory === "MINECRAFT" || !MINECRAFT_ONLY_TABS.has(t.key));

  return (
    <div className="relative">
      <div className="blob w-64 h-64 bg-purple -top-24 -right-16 animate-float pointer-events-none" />

      <div className="relative flex items-center justify-between flex-wrap gap-2 animate-fade-up">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-accent/15 flex items-center justify-center shrink-0">
            <LayoutGrid size={20} className="text-accent" />
          </span>
          <div>
            <h1 className="text-2xl font-bold font-display">{server.name}</h1>
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
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-150 shrink-0 ${
              tab === t.key ? "bg-accent text-white shadow-sm" : "text-text-dim hover:text-text"
            }`}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="relative mt-6 animate-fade-up" style={{ animationDelay: "0.1s" }}>
        {tab === "overview" && <OverviewTab server={server} />}
        {tab === "console" && <ConsoleTab serverId={server.id} />}
        {tab === "players" && <PlayersTab serverId={server.id} />}
        {tab === "plugins" && <PluginsTab serverId={server.id} />}
        {tab === "maker" && <PluginMakerTab serverId={server.id} />}
        {tab === "files" && <FilesTab serverId={server.id} />}
        {tab === "backups" && <BackupsTab serverId={server.id} backupSlots={server.backupSlots} />}
        {tab === "team" && <TeamTab serverId={server.id} isOwner={server.isOwner} />}
        {tab === "settings" && (
          <SettingsTab
            serverId={server.id}
            isOwner={server.isOwner}
            productId={server.productId}
            autoBackupEnabled={server.autoBackupEnabled}
            autoBackupIntervalHours={server.autoBackupIntervalHours}
            autoRestartEnabled={server.autoRestartEnabled}
            autoRestartHour={server.autoRestartHour}
          />
        )}
        {tab === "ai" && <AiTab serverId={server.id} />}
      </div>
    </div>
  );
}
