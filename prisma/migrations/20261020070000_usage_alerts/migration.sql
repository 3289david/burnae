-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "lastDiskUsageAlertAt" TIMESTAMP(3),
ADD COLUMN     "lastRamUsageAlertAt" TIMESTAMP(3);
