
-- AlterEnum
ALTER TYPE "PromotionVerifyMethod" ADD VALUE 'CUSTOM_PRESET_PUBLISHED';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "presetIdRequested" TEXT;

-- CreateTable
CREATE TABLE "UserPreset" (
    "id" TEXT NOT NULL,
    "baseTemplateId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "blurb" TEXT,
    "environment" JSONB NOT NULL,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "delisted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPresetReport" (
    "id" TEXT NOT NULL,
    "presetId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPresetReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserPreset_baseTemplateId_idx" ON "UserPreset"("baseTemplateId");

-- CreateIndex
CREATE INDEX "UserPreset_createdById_idx" ON "UserPreset"("createdById");

-- CreateIndex
CREATE INDEX "UserPreset_delisted_idx" ON "UserPreset"("delisted");

-- CreateIndex
CREATE INDEX "UserPresetReport_presetId_idx" ON "UserPresetReport"("presetId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPresetReport_presetId_reporterId_key" ON "UserPresetReport"("presetId", "reporterId");

-- AddForeignKey
ALTER TABLE "UserPreset" ADD CONSTRAINT "UserPreset_baseTemplateId_fkey" FOREIGN KEY ("baseTemplateId") REFERENCES "ServerTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreset" ADD CONSTRAINT "UserPreset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPresetReport" ADD CONSTRAINT "UserPresetReport_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "UserPreset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

