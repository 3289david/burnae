ALTER TABLE "bot_settings" ADD COLUMN "voiceTriggerChannelId" TEXT;

CREATE TABLE "TempVoiceChannel" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "ownerDiscordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRenamedAt" TIMESTAMP(3),

    CONSTRAINT "TempVoiceChannel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TempVoiceChannel_channelId_key" ON "TempVoiceChannel"("channelId");
