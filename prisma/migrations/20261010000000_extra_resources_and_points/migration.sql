-- AlterEnum
ALTER TYPE "OrderType" ADD VALUE 'POINTS';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ShopItemKind" ADD VALUE 'EXTRA_PORT';
ALTER TYPE "ShopItemKind" ADD VALUE 'EXTRA_SUBDOMAIN';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "pointsAmount" INTEGER;

-- AlterTable
ALTER TABLE "ResourceUpgradeGrant" ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "extraSubdomainSlots" INTEGER NOT NULL DEFAULT 0;
