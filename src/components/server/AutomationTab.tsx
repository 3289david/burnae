"use client";

import AutomationCard from "./AutomationCard";
import ScheduledTasksCard from "./ScheduledTasksCard";
import type { ServerInfo } from "./ServerDetailClient";

export default function AutomationTab({ server }: { server: ServerInfo }) {
  return (
    <div className="tab-grid animate-fade-up">
      <AutomationCard
        serverId={server.id}
        autoBackupEnabled={server.autoBackupEnabled}
        autoBackupIntervalHours={server.autoBackupIntervalHours}
        autoRestartEnabled={server.autoRestartEnabled}
        autoRestartHour={server.autoRestartHour}
        autoRestartOnCrash={server.autoRestartOnCrash}
        autoSleepEnabled={server.autoSleepEnabled}
        autoSleepAfterMinutes={server.autoSleepAfterMinutes}
      />
      <ScheduledTasksCard serverId={server.id} />
    </div>
  );
}
