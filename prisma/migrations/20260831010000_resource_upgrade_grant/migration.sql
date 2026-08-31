
-- CreateTable
CREATE TABLE "ResourceUpgradeGrant" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT,
    "kind" "ShopItemKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceUpgradeGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResourceUpgradeGrant_serverId_idx" ON "ResourceUpgradeGrant"("serverId");

-- CreateIndex
CREATE INDEX "ResourceUpgradeGrant_expiresAt_idx" ON "ResourceUpgradeGrant"("expiresAt");

-- AddForeignKey
ALTER TABLE "ResourceUpgradeGrant" ADD CONSTRAINT "ResourceUpgradeGrant_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceUpgradeGrant" ADD CONSTRAINT "ResourceUpgradeGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceUpgradeGrant" ADD CONSTRAINT "ResourceUpgradeGrant_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ShopItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

