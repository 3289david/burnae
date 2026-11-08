"use client";

import StartupVariablesCard from "./StartupVariablesCard";
import GitDeployCard from "./GitDeployCard";
import DeployHistoryCard from "./DeployHistoryCard";
import HealthCheckCard from "./HealthCheckCard";
import DatabaseConnectCard from "./DatabaseConnectCard";
import StatusPageCard from "./StatusPageCard";
import DiscordInviteCard from "./DiscordInviteCard";
import type { ServerInfo } from "./ServerDetailClient";

/** Git 배포/환경변수/상태 확인처럼 "직접 코드를 올리고 운영하는" 쪽에 필요한 설정만 모은다 —
 * 각 카드가 템플릿 종류에 맞지 않으면 스스로 숨으므로(예: 마인크래프트엔 Git 배포가 안 뜸),
 * 평범한 마인크래프트 서버 주인은 이 탭에서 환경변수 카드 하나만 보게 된다. */
export default function DeveloperTab({ server }: { server: ServerInfo }) {
  const isMinecraft = server.templateCategory === "MINECRAFT";
  return (
    <div className="tab-grid animate-fade-up">
      <StartupVariablesCard serverId={server.id} templateId={server.templateId} />
      {server.templateCategory === "DISCORD_BOT" && <DiscordInviteCard serverId={server.id} />}
      <GitDeployCard serverId={server.id} />
      <DeployHistoryCard serverId={server.id} />
      {!isMinecraft && <HealthCheckCard serverId={server.id} />}
      {!isMinecraft && <DatabaseConnectCard serverId={server.id} />}
      <StatusPageCard serverId={server.id} />
    </div>
  );
}
