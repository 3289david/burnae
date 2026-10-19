/** 번역 키 이름 — 실제 표시 문구는 messages/{locale}.json의 activityLabels 네임스페이스에 있다 */
export const SERVER_ACTIVITY_LABEL_KEYS: Record<string, string> = {
  POWER_START: "powerStart",
  POWER_STOP: "powerStop",
  POWER_RESTART: "powerRestart",
  POWER_KILL: "powerKill",
  BACKUP_RESTORE: "backupRestore",
  REINSTALL: "reinstall",
  RENEW: "renew",
  MEMBER_ADD: "memberAdd",
  MEMBER_REMOVE: "memberRemove",
  RESOURCE_UPGRADE: "resourceUpgrade",
  OWNER_TRANSFER: "ownerTransfer",
  GIT_DEPLOY_SUCCESS: "gitDeploySuccess",
  GIT_DEPLOY_FAILED: "gitDeployFailed",
  SCHEDULED_TASK_RUN: "scheduledTaskRun",
};
