CREATE TABLE "UserActivityLevel" (
    "id" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 0,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserActivityLevel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserActivityLevel_discordUserId_key" ON "UserActivityLevel"("discordUserId");
CREATE INDEX "UserActivityLevel_xp_idx" ON "UserActivityLevel"("xp");
