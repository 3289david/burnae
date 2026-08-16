"use client";

import { useState } from "react";
import OverviewTab from "./OverviewTab";
import ConsoleTab from "./ConsoleTab";
import FilesTab from "./FilesTab";
import BackupsTab from "./BackupsTab";
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
  { key: "overview", label: "개요" },
  { key: "console", label: "콘솔" },
  { key: "files", label: "파일" },
  { key: "backups", label: "백업" },
  { key: "settings", label: "설정" },
  { key: "ai", label: "🤖 AI" },
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
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.key ? "border-accent text-text" : "border-transparent text-text-dim hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "overview" && <OverviewTab server={server} />}
        {tab === "console" && <ConsoleTab serverId={server.id} />}
        {tab === "files" && <FilesTab serverId={server.id} />}
        {tab === "backups" && <BackupsTab serverId={server.id} backupSlots={server.backupSlots} />}
        {tab === "settings" && <SettingsTab serverId={server.id} isOwner={server.isOwner} />}
        {tab === "ai" && <AiTab serverId={server.id} />}
      </div>
    </div>
  );
}
