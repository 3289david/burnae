-- CreateTable
CREATE TABLE "ServerUsageSnapshot" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "cpuPercent" DOUBLE PRECISION NOT NULL,
    "ramMb" INTEGER NOT NULL,
    "diskMb" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerUsageSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerActivityLog" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServerUsageSnapshot_serverId_recordedAt_idx" ON "ServerUsageSnapshot"("serverId", "recordedAt");

-- CreateIndex
CREATE INDEX "ServerActivityLog_serverId_createdAt_idx" ON "ServerActivityLog"("serverId", "createdAt");

-- AddForeignKey
ALTER TABLE "ServerUsageSnapshot" ADD CONSTRAINT "ServerUsageSnapshot_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerActivityLog" ADD CONSTRAINT "ServerActivityLog_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerActivityLog" ADD CONSTRAINT "ServerActivityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
