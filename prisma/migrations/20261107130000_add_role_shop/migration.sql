CREATE TABLE "RoleShopItem" (
    "id" TEXT NOT NULL,
    "discordRoleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleShopItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoleShopItem_discordRoleId_key" ON "RoleShopItem"("discordRoleId");
CREATE INDEX "RoleShopItem_active_idx" ON "RoleShopItem"("active");
