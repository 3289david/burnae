-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "statusPageEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "statusPageSlug" TEXT;

-- CreateTable
CREATE TABLE "UptimeIncident" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "UptimeIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UptimeIncident_serverId_idx" ON "UptimeIncident"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "Server_statusPageSlug_key" ON "Server"("statusPageSlug");

-- AddForeignKey
ALTER TABLE "UptimeIncident" ADD CONSTRAINT "UptimeIncident_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
