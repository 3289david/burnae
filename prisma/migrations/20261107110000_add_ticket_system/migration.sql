-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('SERVER', 'REPORT', 'AD', 'PAYMENT');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'CLOSED');

ALTER TABLE "bot_settings" ADD COLUMN "ticketPanelChannelId" TEXT;
ALTER TABLE "bot_settings" ADD COLUMN "ticketPanelMessageId" TEXT;
ALTER TABLE "bot_settings" ADD COLUMN "ticketCategoryId" TEXT;

CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "guildChannelId" TEXT NOT NULL,
    "openedByDiscordId" TEXT NOT NULL,
    "category" "TicketCategory" NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedByDiscordId" TEXT,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupportTicket_guildChannelId_key" ON "SupportTicket"("guildChannelId");
CREATE INDEX "SupportTicket_openedByDiscordId_status_idx" ON "SupportTicket"("openedByDiscordId", "status");
