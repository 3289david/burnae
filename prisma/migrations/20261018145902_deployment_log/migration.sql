-- CreateEnum
CREATE TYPE "DeployTrigger" AS ENUM ('MANUAL', 'WEBHOOK');

-- CreateTable
CREATE TABLE "DeploymentLog" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "trigger" "DeployTrigger" NOT NULL,
    "actorUserId" TEXT,
    "success" BOOLEAN NOT NULL,
    "output" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER NOT NULL,

    CONSTRAINT "DeploymentLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeploymentLog_serverId_startedAt_idx" ON "DeploymentLog"("serverId", "startedAt");

-- AddForeignKey
ALTER TABLE "DeploymentLog" ADD CONSTRAINT "DeploymentLog_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
