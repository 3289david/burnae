-- 공지 리액션 포인트 + 디스코드 초대 포인트

CREATE TABLE "ReactionRewardClaim" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReactionRewardClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReactionRewardClaim_messageId_discordUserId_key" ON "ReactionRewardClaim"("messageId", "discordUserId");

CREATE TABLE "DiscordInviteReward" (
    "id" TEXT NOT NULL,
    "inviterDiscordUserId" TEXT NOT NULL,
    "invitedDiscordUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordInviteReward_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscordInviteReward_invitedDiscordUserId_key" ON "DiscordInviteReward"("invitedDiscordUserId");
