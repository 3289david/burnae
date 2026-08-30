-- CreateEnum
CREATE TYPE "AiConversationKind" AS ENUM ('CHAT', 'MAKER');

-- AlterTable
ALTER TABLE "AiConversation" ADD COLUMN     "kind" "AiConversationKind" NOT NULL DEFAULT 'CHAT';
