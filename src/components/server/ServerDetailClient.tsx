"use client";

import { useState } from "react";
import {
  LayoutGrid, Terminal, Users, Puzzle, Folder, RefreshCw, UserPlus, Settings, Bot,
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
  allocationIp: string | null;
  allocationPort: number | null;
  ramMb: number;
  diskMb: number;
  cpuPercent: number;
  backupSlots: number;
  templateName: string;
  minecraftVersion: string;
  isOwner: boolean;
}

const TABS = [
  { key: "overview", label: "개요", icon: LayoutGrid },
  { key: "console", label: "콘솔", icon: Terminal },
  { key: "players", label: "플레이어", icon: Users },
  { key: "plugins", label: "플러그인", icon: Puzzle },
  { key: "files", label: "파일", icon: Folder },
  { key: "backups", label: "백업", icon: RefreshCw },
  { key: "team", label: "팀", icon: UserPlus },
  { key: "settings", label: "설정", icon: Settings },
  { key: "ai", label: "AI", icon: Bot },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function ServerDetailClient({ server }: { server: ServerInfo }) {
  const [tab, setTab] = useState<TabKey>("overview");
  const addresses = server.subdomains.map((s) => `${s.subdomain}.${server.subdomainZone}`);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">{server.name}</h1>
          {addresses.length > 0 && (
            <p className="text-text-dim text-sm mt-1">{addresses.join(" · ")}</p>
          )}
        </div>
      </div>

      <div className="mt-6 border-b border-border flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.key ? "border-accent text-text" : "border-transparent text-text-dim hover:text-text"
            }`}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "overview" && <OverviewTab server={server} />}
        {tab === "console" && <ConsoleTab serverId={server.id} />}
        {tab === "players" && <PlayersTab serverId={server.id} />}
        {tab === "plugins" && <PluginsTab serverId={server.id} />}
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
