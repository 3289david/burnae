"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import {
  LayoutGrid, Terminal, Users, Puzzle, Folder, RefreshCw, UserPlus, Bot, Pencil, Check, X,
  Network, Zap, Code2, ArrowUpCircle, AlertTriangle,
} from "lucide-react";
import OverviewTab from "./OverviewTab";
import ConsoleTab from "./ConsoleTab";
import PlayersTab from "./PlayersTab";
import PluginsTab from "./PluginsTab";
import FilesTab from "./FilesTab";
import BackupsTab from "./BackupsTab";
import TeamTab from "./TeamTab";
import NetworkTab from "./NetworkTab";
import AutomationTab from "./AutomationTab";
import DeveloperTab from "./DeveloperTab";
import UpgradeTab from "./UpgradeTab";
import DangerZoneTab from "./DangerZoneTab";
import AiTab from "./AiTab";
import type { ServerAccessRole } from "@/lib/serverRoleRank";

export interface ServerSubdomainInfo {
  id: string;
  subdomain: string;
  isPrimary: boolean;
}

export interface ServerCustomDomainInfo {
  id: string;
  hostname: string;
  verified: boolean;
  sslEligible: boolean;
  sslStatus: "NONE" | "ISSUED" | "FAILED";
  sslError: string | null;
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
  autoRestartOnCrash: boolean;
  autoSleepEnabled: boolean;
  autoSleepAfterMinutes: number;
  autoSleptAt: string | null;
  aiAutoSetupAvailable: boolean;
  subdomains: ServerSubdomainInfo[];
  subdomainZone: string;
  customDomains: ServerCustomDomainInfo[];
  allocationIp: string | null;
  allocationPort: number | null;
  sshPort: number | null;
  extraPorts: { id: number; ip: string; port: number }[];
  extraSubdomainSlots: number;
  ownerNote: string | null;
  ramMb: number;
  diskMb: number;
  cpuPercent: number;
  backupSlots: number;
  templateId: string;
  templateKey: string;
  templateName: string;
  templateCategory: "MINECRAFT" | "DISCORD_BOT" | "GENERAL";
  minecraftVersion: string | null;
  isOwner: boolean;
  /** 이 서버에서 내 등급(OWNER/ADMIN_STAFF/ADMIN/MODERATOR/DEVELOPER/VIEWER) — 뭐에도 안 걸리면 null */
  myRole: ServerAccessRole | null;
  isFreeServer: boolean;
  accessSecret: string | null;
  maintenanceModeEnabled: boolean;
  pausedAt: string | null;
  envGroup: { id: string; name: string } | null;
}

const TABS = [
  { key: "overview", labelKey: "tabOverview", icon: LayoutGrid },
  { key: "console", labelKey: "tabConsole", icon: Terminal },
  { key: "players", labelKey: "tabPlayers", icon: Users },
  { key: "plugins", labelKey: "tabPlugins", icon: Puzzle },
  { key: "files", labelKey: "tabFiles", icon: Folder },
  { key: "backups", labelKey: "tabBackups", icon: RefreshCw },
  { key: "network", labelKey: "tabNetwork", icon: Network },
  { key: "automation", labelKey: "tabAutomation", icon: Zap },
  { key: "developer", labelKey: "tabDeveloper", icon: Code2 },
  { key: "upgrade", labelKey: "tabUpgrade", icon: ArrowUpCircle },
  { key: "team", labelKey: "tabTeam", icon: UserPlus },
  // AI 탭 하나에 채팅(승인 필요)/메이커(자동 실행) 모드를 모두 담는다 — 예전엔 별개 탭이었다
  { key: "ai", labelKey: "tabAi", icon: Bot },
  // 항상 맨 끝 — 재설치/삭제처럼 되돌릴 수 없는 작업만 모아둔다
  { key: "danger", labelKey: "tabDanger", icon: AlertTriangle },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// 플레이어/플러그인 탭은 마인크래프트 전용 기능(화이트리스트, Modrinth 검색)이라 VPS/디스코드봇 같은
// 일반 서버에는 의미가 없어 숨긴다. 메이커는 이제 서버 종류에 상관없이(플러그인/봇/웹사이트 등) 대화로
// 뭔가를 만드는 채팅이라 모든 종류에서 보여준다. 자동화/개발자 도구/업그레이드/위험 구역은 예전
// "설정" 탭이 전부 isOwner로 감싸져 있던 것과 똑같이, 주인이 아니면 탭 자체를 숨긴다(새로 생긴
// 제한이 아니라 기존 동작 그대로 — 협업자는 어차피 그 안의 내용을 하나도 못 봤다).
const MINECRAFT_ONLY_TABS = new Set(["players", "plugins"]);
const OWNER_ONLY_TABS = new Set(["automation", "developer", "upgrade", "danger"]);

const TAB_KEYS = new Set(TABS.map((t) => t.key));

export default function ServerDetailClient({ server }: { server: ServerInfo }) {
  const t = useTranslations("serverDetailClient");
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [tab, setTab] = useState<TabKey>(
    requestedTab && TAB_KEYS.has(requestedTab as TabKey) ? (requestedTab as TabKey) : "overview",
  );
  const [name, setName] = useState(server.name);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(server.name);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const addresses = server.subdomains.map((s) => `${s.subdomain}.${server.subdomainZone}`);
  const visibleTabs = TABS.filter(
    (t) =>
      (server.templateCategory === "MINECRAFT" || !MINECRAFT_ONLY_TABS.has(t.key)) &&
      (server.isOwner || !OWNER_ONLY_TABS.has(t.key)),
  );

  const primarySubdomain = server.subdomains.find((s) => s.isPrimary) ?? server.subdomains[0];
  const previewAddress =
    server.templateCategory !== "MINECRAFT" && primarySubdomain && server.allocationPort
      ? `${primarySubdomain.subdomain}.${server.subdomainZone}`
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
      setNameError(err instanceof Error ? err.message : t("renameFailed"));
    } finally {
      setNameSaving(false);
    }
  }

  return (
    <div className="relative">

      <div className="relative flex items-center justify-between flex-wrap gap-2 animate-fade-up">
        <div className="flex items-center gap-3">
          <div>
            {editingName ? (
              <div className="flex items-center gap-1.5 animate-toast-in">
                <input
                  autoFocus
                  className="input py-1 text-lg font-bold font-display"
                  value={nameInput}
                  maxLength={24}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveName()}
                />
                <button onClick={saveName} disabled={nameSaving} className="text-green p-1 active:scale-90 transition-transform" aria-label={t("saveAria")}>
                  <Check size={18} />
                </button>
                <button
                  onClick={() => {
                    setEditingName(false);
                    setNameInput(name);
                    setNameError(null);
                  }}
                  className="text-text-dim p-1 active:scale-90 transition-transform"
                  aria-label={t("cancelAria")}
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
                    className="text-text-dim hover:text-accent active:scale-90 transition-transform"
                    aria-label={t("renameAria")}
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

      <div className="mt-6 grid lg:grid-cols-[220px_minmax(0,1fr)] gap-5 lg:gap-10 items-start">
      <nav className="lg:sticky lg:top-6 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible border-b lg:border-0 border-border pb-2 lg:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visibleTabs.map((tabDef) => (
          <button
            key={tabDef.key}
            onClick={() => setTab(tabDef.key)}
            aria-current={tab === tabDef.key ? "page" : undefined}
            className={`nav-link shrink-0 whitespace-nowrap ${tabDef.key === "danger" ? "!text-red/80" : ""}`}
          >
            <tabDef.icon size={17} />
            {t(tabDef.labelKey)}
          </button>
        ))}
      </nav>

      <div className="relative min-w-0 animate-fade-up">
        {tab === "overview" && <OverviewTab server={server} />}
        {tab === "console" && <ConsoleTab serverId={server.id} templateCategory={server.templateCategory} myRole={server.myRole} />}
        {tab === "players" && <PlayersTab serverId={server.id} myRole={server.myRole} />}
        {tab === "plugins" && <PluginsTab serverId={server.id} myRole={server.myRole} />}
        {tab === "files" && <FilesTab serverId={server.id} myRole={server.myRole} />}
        {tab === "backups" && <BackupsTab serverId={server.id} backupSlots={server.backupSlots} myRole={server.myRole} />}
        {tab === "network" && <NetworkTab server={server} />}
        {tab === "automation" && <AutomationTab server={server} />}
        {tab === "developer" && <DeveloperTab server={server} />}
        {tab === "upgrade" && <UpgradeTab server={server} />}
        {tab === "team" && <TeamTab serverId={server.id} isOwner={server.isOwner} />}
        {tab === "ai" && (
          <AiTab serverId={server.id} templateCategory={server.templateCategory} previewAddress={previewAddress} myRole={server.myRole} />
        )}
        {tab === "danger" && <DangerZoneTab server={server} />}
      </div>
      </div>
    </div>
  );
}
