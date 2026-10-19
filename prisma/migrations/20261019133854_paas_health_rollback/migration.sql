-- AlterTable
ALTER TABLE "DeploymentLog" ADD COLUMN     "commitSha" TEXT;

-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "deployNotifyWebhookUrl" TEXT,
ADD COLUMN     "gitBranch" TEXT,
ADD COLUMN     "healthCheckFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "healthCheckPath" TEXT,
ADD COLUMN     "lastHealthCheckAt" TIMESTAMP(3);
