ALTER TABLE "AiMessage" ADD COLUMN "clientMessageId" TEXT;
CREATE UNIQUE INDEX "AiMessage_clientMessageId_key" ON "AiMessage"("clientMessageId");
