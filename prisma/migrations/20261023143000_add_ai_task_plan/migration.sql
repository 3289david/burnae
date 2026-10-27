-- CreateEnum
CREATE TYPE "AiTaskStatus" AS ENUM ('PENDING', 'DONE');

-- CreateTable
CREATE TABLE "AiTask" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "AiTaskStatus" NOT NULL DEFAULT 'PENDING',
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AiTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiTask_conversationId_idx" ON "AiTask"("conversationId");

-- AddForeignKey
ALTER TABLE "AiTask" ADD CONSTRAINT "AiTask_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
