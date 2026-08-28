-- CreateEnum
CREATE TYPE "ServerCategory" AS ENUM ('MINECRAFT', 'VPS', 'DISCORD_BOT', 'GENERAL');

-- CreateEnum
CREATE TYPE "SiteMode" AS ENUM ('MINECRAFT_ONLY', 'GENERAL_ONLY', 'BOTH');

-- CreateEnum
CREATE TYPE "ShopItemKind" AS ENUM ('AI_CREDITS', 'DISCOUNT_COUPON', 'CUSTOM');

-- AlterEnum
ALTER TYPE "OrderType" ADD VALUE 'AI_CREDITS';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "aiCreditsAmount" INTEGER;

-- AlterTable
ALTER TABLE "Server" ALTER COLUMN "minecraftVersion" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ServerTemplate" ADD COLUMN     "category" "ServerCategory" NOT NULL DEFAULT 'MINECRAFT';

-- AlterTable
ALTER TABLE "hosting_settings" ADD COLUMN     "siteMode" "SiteMode" NOT NULL DEFAULT 'MINECRAFT_ONLY';

-- CreateTable
CREATE TABLE "ShopItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "ShopItemKind" NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "amount" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopRedemption" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "pointsSpent" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopItem_active_idx" ON "ShopItem"("active");

-- CreateIndex
CREATE INDEX "ShopRedemption_userId_idx" ON "ShopRedemption"("userId");

-- CreateIndex
CREATE INDEX "ServerTemplate_category_idx" ON "ServerTemplate"("category");

-- AddForeignKey
ALTER TABLE "ShopRedemption" ADD CONSTRAINT "ShopRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopRedemption" ADD CONSTRAINT "ShopRedemption_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ShopItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

