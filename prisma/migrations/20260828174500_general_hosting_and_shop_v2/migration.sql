-- AlterEnum
ALTER TYPE "ShopItemKind" ADD VALUE 'EXTRA_FREE_SLOT';

-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "accessSecret" TEXT;

-- AlterTable
ALTER TABLE "ShopItem" ADD COLUMN     "durationDays" INTEGER;

-- CreateTable
CREATE TABLE "ExtraFreeSlotGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtraFreeSlotGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExtraFreeSlotGrant_userId_idx" ON "ExtraFreeSlotGrant"("userId");

-- AddForeignKey
ALTER TABLE "ExtraFreeSlotGrant" ADD CONSTRAINT "ExtraFreeSlotGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
